import type { ReactNode } from 'react';

export function DocumentationLayout({ children }: { children: ReactNode }) {
  return <div className="gallery-shell gallery-layout">{children}</div>;
}
