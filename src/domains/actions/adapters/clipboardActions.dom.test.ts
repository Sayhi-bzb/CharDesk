import { describe, expect, it, vi } from "vitest";
import { GridSnapshotSource } from "@/shared/utils/grid-source";
import {
  buildClipboardPayload,
  parseAnsiClipboardText,
  readClipboardPayload,
  writeClipboardPayload,
} from "@/domains/actions/public";
import { getCellOccupancy } from "@/shared/metrics";
import { createTextRenderingRuntime } from "@/domains/document/public";

const ansiThemeSample = `[38;2;148;163;184m╭──────────────────────────╮[0m
[38;2;148;163;184m│[48;2;239;246;255m [1;38;2;37;99;235m 界面标题[22;38;2;209;213;219m               [0m[38;2;148;163;184m│[38;2;37;99;235m<─[38;2;209;213;219m [1;38;2;37;99;235mPrimary 主色/品牌色[0m
[38;2;148;163;184m├──────────────────────────┤[0m
[38;2;148;163;184m│[48;2;248;250;252m[38;2;15;23;42m 主要内容区域            [0m[38;2;148;163;184m│[0m<─ Foreground 前景文本
[38;2;148;163;184m│[48;2;248;250;252m                          [0m[38;2;148;163;184m│[38;2;209;213;219m<─ Background 背景底色[0m
[38;2;148;163;184m│[48;2;248;250;252m [1;38;2;34;197;94m 操作已完成[22;38;2;209;213;219m             [0m[38;2;148;163;184m│[38;2;34;197;94m<─[38;2;209;213;219m [1;38;2;34;197;94mSemantic: Success 成功[0m
[38;2;148;163;184m│[48;2;248;250;252m [1;38;2;245;158;11m 需要注意[22;38;2;209;213;219m               [0m[38;2;148;163;184m│[38;2;245;158;11m<─[38;2;209;213;219m [1;38;2;245;158;11mSemantic: Warning 警告[0m
[38;2;148;163;184m│[48;2;248;250;252m [1;38;2;239;68;68m 操作失败[22;38;2;209;213;219m               [0m[38;2;148;163;184m│[38;2;239;68;68m<─[38;2;209;213;219m [1;38;2;239;68;68mSemantic: Danger  危险[0m
[38;2;148;163;184m│[48;2;248;250;252m                          [0m[38;2;148;163;184m│[0m
[38;2;148;163;184m│[48;2;248;250;252m [38;2;100;116;139m╭──────╮ [48;2;37;99;235;38;2;255;255;255m╭──────╮[48;2;248;250;252m        [0m[38;2;148;163;184m│<─[38;2;209;213;219m [38;2;148;163;184mNeutral 中性灰/辅助元素[0m
[38;2;148;163;184m│[48;2;248;250;252m [38;2;100;116;139m│ 取消 │ [48;2;37;99;235;1;38;2;255;255;255m│ 确认 │[0m[48;2;236;72;153;1;38;2;255;255;255m  标签 [0m[38;2;148;163;184m│[38;2;236;72;153m<─[38;2;209;213;219m [1;38;2;236;72;153mAccent 强调/高亮色[0m
[38;2;148;163;184m│[48;2;248;250;252m [38;2;100;116;139m╰──────╯ [48;2;37;99;235;38;2;255;255;255m╰──────╯[48;2;248;250;252m        [0m[38;2;148;163;184m│[0m
[38;2;148;163;184m╰──────────────────────────╯[0m`;

const mapAnsiCells = (text: string, color: string, y = 0, startX = 0) => {
  let x = startX;
  return Array.from(text).map((char) => {
    const cell = { x, y, char, color };
    x += getCellOccupancy(char);
    return cell;
  });
};

describe("clipboardActions", () => {
  it("copies a complete wide character when only its follower is requested", () => {
    const payload = buildClipboardPayload(
      new GridSnapshotSource([["0,0", { char: "你", color: "#ffffff" }]]),
      [{ start: { x: 1, y: 0 }, end: { x: 1, y: 0 } }],
      null,
      "#ffffff"
    );

    expect(payload?.plain).toBe("你");
    expect(JSON.parse(payload!.rich!).cells).toEqual([
      { x: 0, y: 0, char: "你", color: "#ffffff" },
    ]);
  });

  it("keeps old rich cell payloads compatible", async () => {
    const legacyData = await readClipboardPayload(
      {
        getData: (type: string) =>
          type === "web application/x-ascii-metropolis"
            ? JSON.stringify({
                type: "ascii-metropolis-zone",
                version: 1,
                cells: [{ x: 0, y: 0, char: "Z", color: "#000000" }],
              })
            : "",
      } as unknown as DataTransfer,
      "#ffffff"
    );

    expect(legacyData.richCells).toEqual([
      { x: 0, y: 0, char: "Z", color: "#000000" },
    ]);
  });

  it("snapshots plain event data before the clipboard event expires", async () => {
    let eventIsActive = true;
    const getData = vi.fn((type: string) => {
      if (!eventIsActive) return "";
      return type === "text/plain" ? "AB" : "";
    });

    const pendingPayload = readClipboardPayload(
      { getData } as unknown as DataTransfer,
      "#ffffff"
    );
    eventIsActive = false;

    await expect(pendingPayload).resolves.toMatchObject({
      plainText: "AB",
    });
    expect(getData.mock.calls.map(([type]) => type)).toEqual([
      "web application/x-ascii-metropolis",
      "text/plain",
    ]);
  });

  it("renders external Markdown through the injected dark text runtime", async () => {
    const runtime = createTextRenderingRuntime();
    const payload = await readClipboardPayload(
      {
        getData: (type: string) =>
          type === "text/plain" ? "**粗体** [site](https://example.com)" : "",
      } as unknown as DataTransfer,
      "#abcdef",
      runtime.render,
      { themeMode: "dark" }
    );

    expect(payload.plainText).toBe("**粗体** [site](https://example.com)");
    expect(payload.richCells?.map((cell) => cell.char).join("")).toBe("粗体 site");
    expect(payload.richCells?.[0]).toMatchObject({
      x: 0,
      char: "粗",
      color: "#f0f6fc",
      attrs: { bold: true },
    });
    expect(payload.richCells?.find((cell) => cell.char === "s")).toMatchObject({
      color: "#58a6ff",
      href: "https://example.com",
    });
  });

  it("awaits lazy code highlighting before returning clipboard cells", async () => {
    const runtime = createTextRenderingRuntime();
    const payload = await readClipboardPayload(
      {
        getData: (type: string) =>
          type === "text/plain" ? "```js\nconst value = 1\n```" : "",
      } as unknown as DataTransfer,
      "#111111",
      runtime.render
    );

    expect(payload.richCells?.map((cell) => cell.char).join("")).toBe(
      "const value = 1"
    );
    expect(payload.richCells?.some((cell) => cell.color !== "#111111")).toBe(true);
  });

  it("preserves text-render diagnostics in the clipboard payload", async () => {
    const diagnostics = [{
      code: "markdown-highlight-failed",
      message: "Could not highlight unknown-language.",
    }];
    const payload = await readClipboardPayload(
      {
        getData: (type: string) => type === "text/plain" ? "source" : "",
      } as unknown as DataTransfer,
      "#111111",
      async () => ({
        kind: "plain",
        renderer: "markdown",
        pipeline: ["markdown"],
        text: "source",
        diagnostics,
      })
    );

    expect(payload.diagnostics).toEqual(diagnostics);
  });

  it("writes app-rich clipboard data during native copy events", async () => {
    const setData = vi.fn();
    const preventDefault = vi.fn();

    const result = await writeClipboardPayload(
      {
        plain: "AB",
        rich: '{"type":"ascii-metropolis-zone","version":1,"cells":[]}',
      },
      {
        event: {
          preventDefault,
          clipboardData: {
            setData,
          },
        } as unknown as ClipboardEvent,
      }
    );

    expect(result).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(setData).toHaveBeenCalledWith("text/plain", "AB");
    expect(setData).toHaveBeenCalledWith(
      "web application/x-ascii-metropolis",
      '{"type":"ascii-metropolis-zone","version":1,"cells":[]}'
    );
  });

  it("builds ANSI clipboard payloads without app-rich data", () => {
    const payload = buildClipboardPayload(
      new GridSnapshotSource([
        ["0,0", { char: "A", color: "#ff0000" }],
        ["1,0", { char: "B", color: "#00ff00" }],
      ]),
      [{ start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }],
      null,
      "#ffffff",
      "ansi"
    );

    expect(payload).toEqual({
      plain: "[91mA[92mB[m",
      rich: null,
    });
  });

  it("copies only the union mask while preserving relative cell positions", () => {
    const payload = buildClipboardPayload(
      new GridSnapshotSource([
        ["0,0", { char: "a", color: "#ffffff" }],
        ["1,0", { char: "b", color: "#ffffff" }],
        ["0,1", { char: "c", color: "#ffffff" }],
        ["1,1", { char: "d", color: "#ffffff" }],
      ]),
      [
        { start: { x: 1, y: 0 }, end: { x: 1, y: 0 } },
        { start: { x: 0, y: 1 }, end: { x: 0, y: 1 } },
      ],
      null,
      "#000000"
    );

    expect(payload?.plain).toBe(" b\nc");
    expect(JSON.parse(payload!.rich!)).toEqual({
      type: "ascii-metropolis-zone",
      version: 1,
      cells: [
        { x: 1, y: 0, char: "b", color: "#ffffff" },
        { x: 0, y: 1, char: "c", color: "#ffffff" },
      ],
    });
  });

  it("materializes selected empty cells without materializing holes", () => {
    const payload = buildClipboardPayload(
      new GridSnapshotSource([["1,0", { char: "X", color: "#ffffff" }]]),
      [
        { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
        { start: { x: 2, y: 0 }, end: { x: 2, y: 0 } },
      ],
      null,
      "#123456"
    );

    expect(payload?.plain).toBe("");
    expect(JSON.parse(payload!.rich!)).toEqual({
      type: "ascii-metropolis-zone",
      version: 1,
      cells: [
        { x: 0, y: 0, char: " ", color: "#123456" },
        { x: 2, y: 0, char: " ", color: "#123456" },
      ],
    });
  });

  it("round-trips compact ANSI clipboard style diffs", () => {
    const payload = buildClipboardPayload(
      new GridSnapshotSource([
        [
          "0,0",
          {
            char: "A",
            color: "#ff0000",
            bgColor: "#0000ff",
            attrs: { bold: true },
          },
        ],
        ["1,0", { char: "B", color: "#00ff00", bgColor: "#0000ff" }],
      ]),
      [{ start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }],
      null,
      "#ffffff",
      "ansi"
    );

    expect(payload?.plain).toBe("[1;91;104mA[22;92mB[m");
    expect(parseAnsiClipboardText(payload!.plain, "#ffffff")).toEqual([
      {
        x: 0,
        y: 0,
        char: "A",
        color: "#ff0000",
        bgColor: "#0000ff",
        attrs: { bold: true },
      },
      {
        x: 1,
        y: 0,
        char: "B",
        color: "#00ff00",
        bgColor: "#0000ff",
      },
    ]);
  });

  it("round-trips exact ANSI256 clipboard colors", () => {
    const payload = buildClipboardPayload(
      new GridSnapshotSource([["0,0", { char: "A", color: "#5f87af" }]]),
      [{ start: { x: 0, y: 0 }, end: { x: 0, y: 0 } }],
      null,
      "#ffffff",
      "ansi"
    );

    expect(payload?.plain).toBe("[38;5;67mA[m");
    expect(parseAnsiClipboardText(payload!.plain, "#ffffff")).toEqual([
      { x: 0, y: 0, char: "A", color: "#5f87af" },
    ]);
  });

  it("preserves trailing background spaces in ANSI clipboard payloads", () => {
    const payload = buildClipboardPayload(
      new GridSnapshotSource(
        Array.from(" BUTTON ").map((char, x) => [
          `${x},0`,
          { char, color: "#000000", bgColor: "#dbeafe" },
        ])
      ),
      [{ start: { x: 0, y: 0 }, end: { x: 7, y: 0 } }],
      null,
      "#000000",
      "ansi"
    );

    expect(payload).toEqual({
      plain: "[30;48;2;219;234;254m BUTTON [m",
      rich: null,
    });
  });

  it("parses ANSI-like clipboard text without ESC prefixes", () => {
    expect(
      parseAnsiClipboardText(
        "[38;2;190;24;93mWhat doesn’t kill [38;2;0;0;0myou makes you stronger.[0m",
        "#ffffff"
      )
    ).toEqual([
      ...Array.from("What doesn’t kill ").map((char, x) => ({
        x,
        y: 0,
        char,
        color: "#be185d",
      })),
      ...Array.from("you makes you stronger.").map((char, offset) => ({
        x: "What doesn’t kill ".length + offset,
        y: 0,
        char,
        color: "#000000",
      })),
    ]);
  });

  it("parses standard ANSI clipboard text and reset color", () => {
    expect(
      parseAnsiClipboardText(
        "\u001b[38;2;255;0;0mA\u001b[0mB",
        "#123456"
      )
    ).toEqual([
      { x: 0, y: 0, char: "A", color: "#ff0000" },
      { x: 1, y: 0, char: "B", color: "#123456" },
    ]);
  });

  it("clears background and attributes on ANSI reset", () => {
    expect(
      parseAnsiClipboardText(
        "\u001b[1;48;2;1;2;3mA\u001b[0mB",
        "#123456"
      )
    ).toEqual([
      {
        x: 0,
        y: 0,
        char: "A",
        color: "#123456",
        bgColor: "#010203",
        attrs: { bold: true },
      },
      { x: 1, y: 0, char: "B", color: "#123456" },
    ]);
  });

  it("clears only background on ANSI default background", () => {
    expect(
      parseAnsiClipboardText(
        "\u001b[48;2;1;2;3mA\u001b[49mB",
        "#123456"
      )
    ).toEqual([
      { x: 0, y: 0, char: "A", color: "#123456", bgColor: "#010203" },
      { x: 1, y: 0, char: "B", color: "#123456" },
    ]);
  });

  it("parses ANSI background, palette colors, and text attributes", () => {
    expect(
      parseAnsiClipboardText(
        "\u001b[1;3;4;9;38;5;196;48;5;21mA\u001b[22;23;24;29;39;49mB",
        "#123456"
      )
    ).toEqual([
      {
        x: 0,
        y: 0,
        char: "A",
        color: "#ff0000",
        bgColor: "#0000ff",
        attrs: {
          bold: true,
          italic: true,
          underline: true,
          strike: true,
        },
      },
      { x: 1, y: 0, char: "B", color: "#123456" },
    ]);
  });

  it("keeps the ANSI compatibility parser syntax-specific", () => {
    expect(
      parseAnsiClipboardText(
        "前 [启动图形界面](https://example.com/gui) 后",
        "#ffffff"
      )
    ).toBeNull();
  });

  it("does not parse malformed Markdown links as rich text", () => {
    expect(parseAnsiClipboardText("[启动图形界面](", "#ffffff")).toBeNull();
    expect(parseAnsiClipboardText("![alt](https://example.com/image.png)", "#ffffff")).toBeNull();
  });
  it("parses OSC 8-like hyperlink shorthand", () => {
    expect(
      parseAnsiClipboardText(
        "]8;;https://example.com\\文字]8;;\\ plain",
        "#ffffff"
      )
    ).toEqual([
      { x: 0, y: 0, char: "文", color: "#ffffff", href: "https://example.com" },
      { x: 2, y: 0, char: "字", color: "#ffffff", href: "https://example.com" },
      { x: 4, y: 0, char: " ", color: "#ffffff" },
      { x: 5, y: 0, char: "p", color: "#ffffff" },
      { x: 6, y: 0, char: "l", color: "#ffffff" },
      { x: 7, y: 0, char: "a", color: "#ffffff" },
      { x: 8, y: 0, char: "i", color: "#ffffff" },
      { x: 9, y: 0, char: "n", color: "#ffffff" },
    ]);
  });

  it("parses hyperlink shorthand without a backslash before SGR", () => {
    expect(
      parseAnsiClipboardText(
        "]8;;https://example.com/gui[1;38;2;255;255;255;48;2;37;99;235m 启动图形界面 ]8;;[0m",
        "#000000"
      )
    ).toEqual([
      {
        x: 0,
        y: 0,
        char: " ",
        color: "#ffffff",
        bgColor: "#2563eb",
        attrs: { bold: true },
        href: "https://example.com/gui",
      },
      {
        x: 1,
        y: 0,
        char: "启",
        color: "#ffffff",
        bgColor: "#2563eb",
        attrs: { bold: true },
        href: "https://example.com/gui",
      },
      {
        x: 3,
        y: 0,
        char: "动",
        color: "#ffffff",
        bgColor: "#2563eb",
        attrs: { bold: true },
        href: "https://example.com/gui",
      },
      {
        x: 5,
        y: 0,
        char: "图",
        color: "#ffffff",
        bgColor: "#2563eb",
        attrs: { bold: true },
        href: "https://example.com/gui",
      },
      {
        x: 7,
        y: 0,
        char: "形",
        color: "#ffffff",
        bgColor: "#2563eb",
        attrs: { bold: true },
        href: "https://example.com/gui",
      },
      {
        x: 9,
        y: 0,
        char: "界",
        color: "#ffffff",
        bgColor: "#2563eb",
        attrs: { bold: true },
        href: "https://example.com/gui",
      },
      {
        x: 11,
        y: 0,
        char: "面",
        color: "#ffffff",
        bgColor: "#2563eb",
        attrs: { bold: true },
        href: "https://example.com/gui",
      },
      {
        x: 13,
        y: 0,
        char: " ",
        color: "#ffffff",
        bgColor: "#2563eb",
        attrs: { bold: true },
        href: "https://example.com/gui",
      },
    ]);
  });
  it("parses multiple backslash-free linked SGR segments", () => {
    const cells = parseAnsiClipboardText(
      "]8;;https://example.com/gui[1;38;2;255;255;255;48;2;37;99;235m 启动图形界面 ]8;;[0m  ]8;;https://example.com/logs[1;38;2;255;255;255;48;2;100;116;139m 查看系统日志 ]8;;[0m",
      "#000000"
    );

    expect(cells).not.toBeNull();
    expect(cells?.some((cell) => cell.href === "https://example.com/gui")).toBe(true);
    expect(cells?.some((cell) => cell.href === "https://example.com/logs")).toBe(true);
    expect(cells?.some((cell) => cell.char === "查" && !cell.href)).toBe(false);
  });
  it("combines hyperlink shorthand with SGR style", () => {
    expect(
      parseAnsiClipboardText(
        "]8;;https://example.com\\[38;2;255;0;0mA]8;;\\B",
        "#ffffff"
      )
    ).toEqual([
      { x: 0, y: 0, char: "A", color: "#ff0000", href: "https://example.com" },
      { x: 1, y: 0, char: "B", color: "#ff0000" },
    ]);
  });
  it("parses inverse ANSI style without swapping stored colors", () => {
    expect(
      parseAnsiClipboardText(
        "\u001b[7;38;2;10;20;30;48;2;40;50;60mA",
        "#ffffff"
      )
    ).toEqual([
      {
        x: 0,
        y: 0,
        char: "A",
        color: "#0a141e",
        bgColor: "#28323c",
        attrs: { inverse: true },
      },
    ]);
  });

  it("preserves styled background spaces in a terminal UI sample", () => {
    const cells = parseAnsiClipboardText(ansiThemeSample, "#ffffff");
    expect(cells).not.toBeNull();

    const titleLineCells = cells!.filter((cell) => cell.y === 1);
    expect(titleLineCells).toContainEqual({
      x: 1,
      y: 1,
      char: " ",
      color: "#94a3b8",
      bgColor: "#eff6ff",
    });
    expect(titleLineCells).toContainEqual({
      x: 3,
      y: 1,
      char: "界",
      color: "#2563eb",
      bgColor: "#eff6ff",
      attrs: { bold: true },
    });
    expect(titleLineCells).toContainEqual({
      x: 5,
      y: 1,
      char: "面",
      color: "#2563eb",
      bgColor: "#eff6ff",
      attrs: { bold: true },
    });
  });

  it("parses combined background and foreground SGR in either order", () => {
    expect(
      parseAnsiClipboardText("[48;2;37;99;235;38;2;255;255;255mA", "#000000")
    ).toEqual([
      {
        x: 0,
        y: 0,
        char: "A",
        color: "#ffffff",
        bgColor: "#2563eb",
      },
    ]);
  });

  it("does not parse plain bracketed text as ANSI", () => {
    expect(parseAnsiClipboardText("hello [world]", "#ffffff")).toBeNull();
  });

  it("preserves ANSI color across wide characters and new lines", () => {
    expect(
      parseAnsiClipboardText("\u001b[38;2;255;255;255m你A\nB", "#000000")
    ).toEqual([
      { x: 0, y: 0, char: "你", color: "#ffffff" },
      { x: 2, y: 0, char: "A", color: "#ffffff" },
      { x: 0, y: 1, char: "B", color: "#ffffff" },
    ]);
  });

  it("preserves CRLF new lines in ANSI-like clipboard text", () => {
    expect(
      parseAnsiClipboardText(
        "[38;2;244;63;94m[ 比例数字 (Proportional Nums) - 每个数字宽度根据字形变化 ][0m\r\n  [38;2;251;146;60m1 1 1 . 1 1[0m",
        "#ffffff"
      )
    ).toEqual([
      ...mapAnsiCells(
        "[ 比例数字 (Proportional Nums) - 每个数字宽度根据字形变化 ]",
        "#f43f5e"
      ),
      { x: 0, y: 1, char: " ", color: "#ffffff" },
      { x: 1, y: 1, char: " ", color: "#ffffff" },
      ...mapAnsiCells("1 1 1 . 1 1", "#fb923c", 1, 2),
    ]);
  });

  it("writes ANSI copy event data as text/plain only", async () => {
    const setData = vi.fn();
    const preventDefault = vi.fn();

    const result = await writeClipboardPayload(
      {
        plain: "[38;2;255;0;0mA[0m",
        rich: null,
      },
      {
        event: {
          preventDefault,
          clipboardData: {
            setData,
          },
        } as unknown as ClipboardEvent,
      }
    );

    expect(result).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(setData).toHaveBeenCalledTimes(1);
    expect(setData).toHaveBeenCalledWith(
      "text/plain",
      "[38;2;255;0;0mA[0m"
    );
  });
});
