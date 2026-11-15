"""Built CLI acceptance on a POSIX PTY; not physical-terminal evidence."""

import fcntl
import json
import os
from pathlib import Path
import pty
import select
import shutil
import signal
import struct
import subprocess
import tempfile
import termios
import time


ROOT = Path(__file__).resolve().parents[3]
BUN = shutil.which("bun")
assert BUN, "Bun must be on PATH"
CLI = [BUN, str(ROOT / "packages/cli/dist/cli.js")]


class Terminal:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.target = self.directory / "shared.chardesk"
        self.target.write_text("---\nchardesk: document/v1\nmode: freeform\ntitle: Shared\n---\n")
        self.env = dict(os.environ, CHARDESK_HOME=str(self.directory / "home"),
                        TERM="xterm-256color", TERM_PROGRAM="WarpTerminal", LC_ALL="C.UTF-8")
        for name in ("TMUX", "STY", "ZELLIJ", "CHARDESK_TRACE_INPUT"):
            self.env.pop(name, None)
        self.wire = bytearray()
        self.master, self.slave = pty.openpty()
        fcntl.ioctl(self.slave, termios.TIOCSWINSZ, struct.pack("HHHH", 24, 100, 0, 0))
        self.modes = termios.tcgetattr(self.slave)
        self.child = subprocess.Popen(CLI + ["tui", str(self.target)], stdin=self.slave,
                                      stdout=self.slave, stderr=self.slave,
                                      env=self.env, cwd=self.directory, close_fds=True)

    def drain(self, seconds=0.05):
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            if select.select([self.master], [], [], 0.01)[0]:
                self.wire.extend(os.read(self.master, 65536))

    def until(self, predicate, label):
        end = time.monotonic() + 10
        while not predicate():
            self.drain()
            assert self.child.poll() is None, (label, self.wire[-1500:])
            assert time.monotonic() < end, (label, self.wire[-1500:])

    def send(self, data):
        os.write(self.master, data)
        self.drain()

    def click(self, x, y):
        self.send(f"\x1b[<0;{x+1};{y+1}M\x1b[<0;{x+1};{y+1}m".encode())

    def call(self, operation, payload, success=True):
        # Drain the TUI while the independent CLI runs, so output backpressure
        # cannot be mistaken for a runtime deadlock.
        with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
            command = subprocess.Popen(CLI + ["canvas", operation, "--file", str(self.target), "--json"],
                                       stdin=subprocess.PIPE, stdout=output, stderr=errors,
                                       env=self.env, cwd=self.directory)
            command.stdin.write(json.dumps(payload).encode())
            command.stdin.close()
            end = time.monotonic() + 15
            try:
                while command.poll() is None:
                    self.drain()
                    assert time.monotonic() < end, "CLI request timed out"
                output.seek(0)
                errors.seek(0)
                data = json.loads(output.read())
                assert (command.returncode == 0) == success, (data, errors.read())
                return data
            finally:
                if command.poll() is None:
                    command.kill()
                    command.wait()

    def read(self):
        return self.call("read", {"viewport": [-10, -10, 70, 35]})

    def stopped(self):
        end = time.monotonic() + 10
        while self.child.poll() is None:
            self.drain()
            assert time.monotonic() < end, self.wire[-1500:]
        self.drain()
        assert self.child.returncode == 0, self.wire[-1500:]
        assert termios.tcgetattr(self.slave) == self.modes, "Terminal modes were not restored"
        assert b"\x1b[?1049l" in self.wire, "Alternate screen was not released"

    def close(self):
        if self.child.poll() is None:
            self.child.kill()
            self.child.wait(timeout=5)
        os.close(self.master)
        os.close(self.slave)


def shared_canvas(t):
    t.until(lambda: b"F1 for shortcuts" in t.wire, "startup")
    t.click(2, 22)  # Dock Edit
    t.click(0, 1)
    t.send("HUMAN界".encode())
    initial = t.read()
    assert "HUMAN界" in initial["content"], initial
    request = {"at": [20, 5], "content": "AGENT", "baseVersion": initial["version"], "requestId": "pty-agent"}
    written = t.call("write", request)
    assert written["persistence"] == "saved", written
    t.send(b"!")
    after = t.read()
    assert "HUMAN界!" in after["content"] and "AGENT" in after["content"], after
    stale = t.call("write", {"at": [0, 0], "content": "LOST", "baseVersion": initial["version"]}, False)
    assert stale["code"] == "version_conflict", stale
    repeated = t.call("write", request)
    assert repeated["version"] == written["version"], repeated
    assert t.read()["version"] == after["version"]
    t.send(b"\x11")  # Ctrl+Q: save and quit
    t.stopped()
    reopened = t.read()
    assert reopened["version"] == after["version"] and "HUMAN界!" in reopened["content"], reopened
    t.call("write", request)
    assert t.read()["version"] == after["version"]


def interrupted_ui(t):
    t.until(lambda: b"F1 for shortcuts" in t.wire, "startup")
    t.click(2, 22)
    t.click(0, 1)
    t.send(b"BEFORE")
    before = t.read()
    # Help owns typing; a resize cancels the in-progress pointer gesture.
    t.send(b"\x1bOP")  # F1
    t.send(b"MUST_NOT_EDIT")
    assert t.read()["version"] == before["version"]
    t.send(b"\x1b")
    t.drain(0.1)  # legacy ESC disambiguation
    t.send(b"\x1b[<0;2;3M\x1b[<32;8;5M")
    fcntl.ioctl(t.slave, termios.TIOCSWINSZ, struct.pack("HHHH", 6, 18, 0, 0))
    t.child.send_signal(signal.SIGWINCH)
    t.drain(0.1)
    t.send(b"\x1b[<0;8;5m")
    fcntl.ioctl(t.slave, termios.TIOCSWINSZ, struct.pack("HHHH", 24, 100, 0, 0))
    t.child.send_signal(signal.SIGWINCH)
    t.drain(0.1)
    t.click(0, 1)
    t.send(b"AFTER")
    after = t.read()
    assert "AFTER" in after["content"] and "MUST_NOT_EDIT" not in after["content"], after
    t.child.send_signal(signal.SIGTERM)
    t.stopped()
    assert t.read()["version"] == after["version"]


for scenario in (shared_canvas, interrupted_ui):
    with tempfile.TemporaryDirectory(prefix="chardesk-tui-acceptance-") as directory:
        terminal = Terminal(directory)
        try:
            scenario(terminal)
            print(json.dumps({"scenario": scenario.__name__, "status": "passed", "evidence": "pty"}), flush=True)
        finally:
            terminal.close()
