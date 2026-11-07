#!/usr/bin/env bun
export {};
const args = process.argv.slice(2);
if (!args.length || args[0] === 'tui') {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('Use an interactive terminal, or chardesk --help.');
    process.exitCode = 2;
  } else {
    const { runTerminal } = await import('../../terminal/src/main.ts');
    await runTerminal(args.slice(args[0] === 'tui' ? 1 : 0));
  }
} else if (args[0] === 'canvas') {
  let usage = true;
  try {
    const { parseArgs } = await import('node:util');
    const { positionals, values } = parseArgs({
      args: args.slice(1),
      allowPositionals: true,
      options: { file: { type: 'string' }, session: { type: 'string' }, json: { type: 'boolean' } },
    });
    if (positionals.length !== 1 || (values.file && values.session))
      throw new Error('Usage: chardesk canvas <operation> [--file path | --session id] --json');
    const input = process.stdin.isTTY ? {} : JSON.parse((await Bun.stdin.text()).trim() || '{}');
    usage = false;
    const { executeLocal } = await import('../../local-runtime/src/command.ts');
    const result = await executeLocal(`canvas_${positionals[0]}`, input, {
      file: values.file,
      session: values.session,
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
