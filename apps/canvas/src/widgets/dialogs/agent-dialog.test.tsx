import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setUiLanguage } from '@/shared/i18n';
import { publishWebMcpStatus } from '@/shared/services/webmcp-status';
import { AgentDialog } from './agent-dialog';

const local = vi.hoisted(() => ({
  enabled: false,
  revision: 0,
  listeners: new Set<() => void>(),
  saved: null as null | { url: string; scope: string; expiresAt: number },
  forget: vi.fn(), setEnabled: vi.fn(),
}));
vi.mock('@/shared/services/local-agent', () => ({
  getLocalAgentEnabled: () => local.enabled,
  getLocalAgentRevision: () => local.revision,
  getRememberedLocalAgent: () => local.saved,
  subscribeLocalAgent: (listener: () => void) => {
    local.listeners.add(listener);
    return () => { local.listeners.delete(listener); };
  },
  setLocalAgentEnabled: local.setEnabled,
  forgetLocalAgent: local.forget,
}));
describe('Agent connection dialog', () => {
  beforeEach(() => {
    local.enabled = false;
    local.saved = null;
    local.setEnabled.mockReset();
    local.forget.mockReset();
    setUiLanguage('en');
    publishWebMcpStatus('unavailable');
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); setUiLanguage('en'); });

  it('shows two compact channels and live WebMCP readiness without claiming a connection', () => {
    render(<AgentDialog open onOpenChange={vi.fn()} />);
    const web = within(screen.getByRole('group', { name: 'WebMCP' }));
    const localRow = within(screen.getByRole('group', { name: 'Local MCP' }));
    expect(screen.queryByLabelText('Pairing URL')).not.toBeInTheDocument();
    for (const [status, label] of [
      ['preparing', 'Preparing…'], ['ready', 'Ready'], ['error', 'Error'], ['unavailable', 'Unavailable'],
    ] as const) {
      act(() => publishWebMcpStatus(status));
      expect(web.getByRole('status')).toHaveTextContent(label);
      expect(localRow.getByRole('switch', { name: 'Connect local coding agents' })).toHaveAttribute('aria-checked', 'false');
    }
    expect(local.setEnabled).not.toHaveBeenCalled();
  });

  it('connects from the Local MCP switch without an agent-specific pairing step', async () => {
    render(<AgentDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Connect local coding agents' }));
    expect(local.setEnabled).toHaveBeenCalledOnce();
    expect(local.setEnabled.mock.calls[0][0]).toBe(true);
    act(() => {
      local.enabled = true;
      local.revision++;
      for (const listener of local.listeners) listener();
    });
    const localRow = within(screen.getByRole('group', { name: 'Local MCP' }));
    expect(localRow.getByRole('switch', { name: 'Connect local coding agents' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(localRow.getByRole('switch', { name: 'Connect local coding agents' }));
    expect(local.setEnabled).toHaveBeenLastCalledWith(false);
  });

  it('keeps remembered pairing actions and localizes status', () => {
    local.saved = { url: 'saved-url', scope: 'canvas-a', expiresAt: Date.now() + 60_000 };
    local.enabled = true;
    setUiLanguage('zh');
    render(<AgentDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Agent' })).toBeVisible();
    expect(within(screen.getByRole('group', { name: 'WebMCP' })).getByRole('status')).toHaveTextContent('不可用');
    expect(within(screen.getByRole('group', { name: 'Local MCP' })).getByRole('switch', { name: '连接本地 coding agent' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: '忘记配对' }));
    expect(local.forget).toHaveBeenCalledOnce();
  });
});
