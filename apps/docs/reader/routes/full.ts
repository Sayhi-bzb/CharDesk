import { manualEntries } from '../content';
export async function loader() {
  return new Response((await manualEntries()).map(page => `# ${page.title}\n\n${page.markdown}`).join('\n\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
