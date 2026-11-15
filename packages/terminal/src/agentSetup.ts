import type { Translate } from './i18n.ts';

/** One consumer handoff, shared verbatim by the view and its Copy action. */
export function agentSetupText(t: Translate) {
  return [
    t('Install and configure CharDesk for this coding agent:'),
    '',
    'Skill:',
    'npx skills add https://github.com/sayhi-bzb/chardesk --skill chardesk',
    '',
    'CLI:',
    t('Ensure Bun >=1.3.14 is installed, then run:'),
    'bun add -g @chardesk/cli',
    '',
    'MCP:',
    t('Register an MCP server named chardesk in this client, using this launch command:'),
    'npx -y @chardesk/mcp',
    '',
    'More:',
    'https://docs.chardesk.com/llms.txt',
  ].join('\n');
}
