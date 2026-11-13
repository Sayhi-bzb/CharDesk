import { Links, Meta, Outlet, Scripts, ScrollRestoration, isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';
import { useCallback, type ReactNode } from 'react';
import { DocumentationAppearance } from '@chardesk/docs-ui/appearance';
import { DocumentationLinks, openBrowserLink } from '@chardesk/docs-ui/links';
import { manualBootScript, manualBootStyles } from './boot';
import './styles.css';
import '@chardesk/fonts/fonts.css';
import '@chardesk/font-maple/fonts.css';

const appearanceScript = `try{let t=localStorage.getItem('chardesk-docs-theme');document.documentElement.dataset.galleryTheme=t==='light'||t==='dark'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch{}`;
export function Layout({ children }: { children: ReactNode }) {
  return <html lang="en" suppressHydrationWarning><head>
    <meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <style dangerouslySetInnerHTML={{ __html: manualBootStyles }} />
    <script dangerouslySetInnerHTML={{ __html: appearanceScript }} />
    <script dangerouslySetInnerHTML={{ __html: manualBootScript }} />
    <Meta /><Links /><noscript><style>{`.manual-navigation{display:grid!important}.manual-menu{display:none!important}`}</style></noscript>
  </head><body><a className="skip-link" href="#manual-content">Skip to content</a>
    <DocumentationAppearance storagePrefix="chardesk-docs">{children}</DocumentationAppearance><ScrollRestoration /><Scripts />
  </body></html>;
}
export default function App() {
  const navigate = useNavigate();
  const openLink = useCallback((href: string, target?: '_blank') => {
    const url = new URL(href, window.location.href);
    if (target !== '_blank' && url.origin === window.location.origin) {
      void navigate(`${url.pathname}${url.search}${url.hash}`);
    } else openBrowserLink(href, target);
  }, [navigate]);
  return <DocumentationLinks onNavigate={openLink}><Outlet /></DocumentationLinks>;
}
export function ErrorBoundary() {
  const error = useRouteError();
  const missing = isRouteErrorResponse(error) && error.status === 404;
  return <main className="manual-error" id="manual-content">
    <title>{`${missing ? 'Page not found' : 'Manual unavailable'} · CharDesk`}</title>
    <meta name="robots" content="noindex, nofollow" />
    <h1>{missing ? 'Page not found' : 'Manual unavailable'}</h1>
    <p>{missing ? 'There is no guide at this address.' : 'Reload to try again, or return to the home page.'}</p>
    <a href="/">Back to the manual</a>
  </main>;
}
