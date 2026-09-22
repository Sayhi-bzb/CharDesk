import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { RootProvider } from "fumadocs-ui/provider/react-router";
import type { Route } from "./+types/root";
import { DocsErrorShell } from "@/components/docs-shell";
import DocsSearchDialog from "@/components/search";
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="/fonts/fonts.css" />
        <Meta />
        <Links />
      </head>
      <body className="flex min-h-screen flex-col">
        <RootProvider search={{ SearchDialog: DocsSearchDialog }}>
          {children}
        </RootProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const details = notFound
    ? "The requested documentation page does not exist."
    : error instanceof Error
      ? error.message
      : "An unexpected error occurred.";

  return (
    <DocsErrorShell>
      <title>{notFound ? "Page not found | CharDesk Docs" : "Documentation unavailable | CharDesk Docs"}</title>
      <meta name="robots" content="noindex, nofollow" />
      <div className="mx-auto w-full max-w-3xl p-8">
        <p className="mb-2 text-sm text-muted-foreground">
          {notFound ? "404" : "Error"}
        </p>
        <h1 className="mb-3 text-3xl font-semibold">
          {notFound ? "Page not found" : "Documentation unavailable"}
        </h1>
        <p className="mb-6 text-muted-foreground">{details}</p>
        <a className="font-medium underline" href="/docs/">
          Return to CharDesk Docs
        </a>
      </div>
    </DocsErrorShell>
  );
}
