import { useSyncExternalStore } from 'react';

export const APP_ROUTE_EVENT = 'chardesk:route-change';

export const isWorkspaceRoute = (location: Pick<Location, 'pathname'>) =>
  location.pathname === '/workspace';

const subscribe = (listener: () => void) => {
  window.addEventListener('popstate', listener);
  window.addEventListener(APP_ROUTE_EVENT, listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener(APP_ROUTE_EVENT, listener);
  };
};

export const useWorkspaceRoute = () => useSyncExternalStore(
  subscribe,
  () => isWorkspaceRoute(window.location),
  () => false,
);

export const navigateApp = (path: string) => {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new Event(APP_ROUTE_EVENT));
};
