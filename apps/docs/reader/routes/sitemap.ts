import { manualEntries } from '../content';
export async function loader() {
  const urls = (await manualEntries()).map(page => `<url><loc>https://docs.chardesk.com${page.url}</loc></url>`);
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
