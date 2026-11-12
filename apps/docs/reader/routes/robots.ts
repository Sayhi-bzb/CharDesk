export function loader() { return new Response('User-agent: *\nAllow: /\nSitemap: https://docs.chardesk.com/sitemap.xml\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
