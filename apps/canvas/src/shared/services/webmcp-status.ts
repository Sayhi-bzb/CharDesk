export type WebMcpStatus = 'preparing' | 'ready' | 'unavailable' | 'error';

let status: WebMcpStatus = 'preparing';
const listeners = new Set<() => void>();

export const getWebMcpStatus = () => status;
export const subscribeWebMcpStatus = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export function publishWebMcpStatus(next: WebMcpStatus) {
  if (status === next) return;
  status = next;
  for (const listener of listeners) listener();
}
