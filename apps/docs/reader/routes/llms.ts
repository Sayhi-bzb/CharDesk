import { manualEntries } from '../content';
export async function loader() {
  const pages = await manualEntries();
  return new Response('# CharDesk Manual\n\n' + pages.map(page => `- [${page.title}](https://docs.chardesk.com${page.url}): ${page.description}`).join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
