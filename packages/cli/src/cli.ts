#!/usr/bin/env bun
export {};
declare const __CHARDESK_VERSION__: string;
const version = typeof __CHARDESK_VERSION__ === 'undefined' ? 'development' : __CHARDESK_VERSION__;
const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log(version);
} else if (!args.length || args[0] === 'tui') {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('Use an interactive terminal, or chardesk --help.');
    process.exitCode = 2;
  } else {
    const { runTerminal } = await import('@chardesk/terminal/main');
    const terminalArgs = args.slice(args[0] === 'tui' ? 1 : 0);
    if (terminalArgs.includes('--help') || terminalArgs.includes('--snapshot')) {
      await runTerminal(terminalArgs);
    } else {
      const { CliUpdates } = await import('./updates.js');
      const { resolveAppPaths } = await import('@chardesk/local-runtime/appPaths');
      const updates = new CliUpdates(version, resolveAppPaths().cache);
      try {
        await runTerminal(terminalArgs, { updates });
      } finally {
        updates.dispose();
      }
    }
  }
} else if (args[0] === 'canvas') {
  let usage = true;
  try {
    const { parseArgs } = await import('node:util');
    const { positionals, values } = parseArgs({
      args: args.slice(1),
      allowPositionals: true,
      options: {
        file: { type: 'string' },
        session: { type: 'string' },
        json: { type: 'boolean' },
        agent: { type: 'string' },
        'agent-name': { type: 'string' },
      },
    });
    if (positionals.length !== 1 || (values.file && values.session))
      throw new Error('Usage: chardesk canvas <operation> [--file path | --session id] --json');
    const input = process.stdin.isTTY ? {} : JSON.parse((await Bun.stdin.text()).trim() || '{}');
    const { executeLocal } = await import('@chardesk/local-runtime/command');
    const { parseAgentIdentity } = await import('@chardesk/local-runtime/agents');
    const id = values.agent ?? process.env.CHARDESK_AGENT_ID;
    const agentName = values['agent-name'] ?? process.env.CHARDESK_AGENT_NAME;
    if (!id && agentName) throw new Error('Agent name requires an agent ID.');
    const agent = parseAgentIdentity(id === undefined ? undefined : { id, name: agentName });
    usage = false;
    const result = await executeLocal(`canvas_${positionals[0]}`, input, {
      file: values.file,
      session: values.session,
      agent,
      ...(agent ? { invocation: { argv: ['chardesk', ...args] } } : {}),
    });
    console.log(JSON.stringify(result));
    if (result && typeof result === 'object' && 'ok' in result && result.ok === false)
      process.exitCode = 1;
  } catch (error) {
    if (args.includes('--json'))
      console.log(
        JSON.stringify({
          ok: false,
          code: usage ? 'invalid_input' : 'local_operation_failed',
          message: String(error),
        })
      );
    else console.error(String(error));
    process.exitCode = usage ? 2 : 1;
  }
} else {
  const { runCli } = await import('./command.js');
  process.exitCode = await runCli(args, {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  });
}
