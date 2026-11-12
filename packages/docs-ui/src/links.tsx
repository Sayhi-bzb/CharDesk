import { createContext, useContext, type ReactNode } from 'react';

type OpenLink = (href: string, target?: '_blank') => void;

export const openBrowserLink: OpenLink = (href, target) => {
  if (target === '_blank') window.open(href, '_blank', 'noopener,noreferrer');
  else window.location.assign(href);
};

const LinkContext = createContext<OpenLink>(openBrowserLink);

// Each host supplies its router; standalone consumers keep native navigation.
export function DocumentationLinks({ onNavigate, children }: { onNavigate: OpenLink; children: ReactNode }) {
  return <LinkContext.Provider value={onNavigate}>{children}</LinkContext.Provider>;
}

export const useDocumentationLink = () => useContext(LinkContext);
