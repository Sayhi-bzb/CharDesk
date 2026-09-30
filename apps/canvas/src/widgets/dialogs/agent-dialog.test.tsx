import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setUiLanguage } from '@/shared/i18n';
import { clipboard } from '@/shared/services/effects';
import { publishWebMcpStatus } from '@/shared/services/webmcp-status';
import { AgentDialog } from './agent-dialog';

const local = vi.hoisted(() => ({
  status: 'idle' as 'idle' | 'connecting' | 'connected' | 'error',
  revision: 0,
  listeners: new Set<() => void>(),
  saved: null as null | { url: string; scope: string; expiresAt: number },
  connect: vi.fn(), disconnect: vi.fn(), forget: vi.fn(),
}));
vi.mock('@/shared/services/local-agent', () => ({
  getLocalAgentStatus: () => local.status,
  getLocalAgentRevision: () => local.revision,
  getRememberedLocalAgent: () => local.saved,
  subscribeLocalAgent: (listener: () => void) => {
    local.listeners.add(listener);
    return () => { local.listeners.delete(listener); };
  },
  connectLocalAgent: local.connect,
  disconnectLocalAgent: local.disconnect,
  forgetLocalAgent: local.forget,
}));
const setLocalStatus = (status: typeof local.status) => act(() => {
  local.status = status;
  local.revision++;
  for (const listener of local.listeners) listener();
});

describe('Agent connection dialog', () => {
  beforeEach(() => {
    local.status = 'idle';
    local.saved = null;
    local.connect.mockReset();
    local.disconnect.mockReset();
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
      expect(localRow.getByRole('status')).toHaveTextContent('Not connected');
      expect(localRow.getByRole('button', { name: 'Pair' })).toHaveAttribute('aria-expanded', 'false');
    }
    expect(local.connect).not.toHaveBeenCalled();
    expect(local.disconnect).not.toHaveBeenCalled();
  });

  it('expands only local pairing, copies inline, reports invalid input, and folds after connection', async () => {
    vi.spyOn(clipboard, 'writeText').mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    render(<AgentDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pair' }));
    expect(screen.getByText('Read/write this Canvas locally. Switching Canvas disconnects.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Copy command' }));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeVisible();
    expect(clipboard.writeText).toHaveBeenCalledWith('npm run mcp:pair');
    fireEvent.click(screen.getByRole('button', { name: 'Copied' }));
    expect(await screen.findByRole('button', { name: 'Copy failed' })).toBeVisible();
    const input = screen.getByLabelText('Pairing URL');
    fireEvent.change(input, { target: { value: 'bad' } });
    local.connect.mockImplementationOnce(() => { throw new Error('Invalid URL'); });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid pairing URL');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(input, { target: { value: 'ws://127.0.0.1:9494/bridge?token=test' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(local.connect).toHaveBeenLastCalledWith('ws://127.0.0.1:9494/bridge?token=test', true);
    setLocalStatus('connected');
    expect(screen.queryByLabelText('Pairing URL')).not.toBeInTheDocument();
    const localRow = within(screen.getByRole('group', { name: 'Local MCP' }));
    expect(localRow.getByRole('status')).toHaveTextContent('Connected');
    fireEvent.click(localRow.getByRole('button', { name: 'Disconnect' }));
    expect(local.disconnect).toHaveBeenCalledOnce();
  });

  it('keeps remembered pairing actions and localizes status', () => {
    local.saved = { url: 'saved-url', scope: 'canvas-a', expiresAt: Date.now() + 60_000 };
    local.status = 'connected';
    setUiLanguage('zh');
    render(<AgentDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Agent' })).toBeVisible();
    expect(within(screen.getByRole('group', { name: 'WebMCP' })).getByRole('status')).toHaveTextContent('不可用');
    expect(within(screen.getByRole('group', { name: 'Local MCP' })).getByRole('status')).toHaveTextContent('已连接');
    fireEvent.click(screen.getByRole('button', { name: '忘记配对' }));
    expect(local.forget).toHaveBeenCalledOnce();
  });
});
