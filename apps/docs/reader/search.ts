export type SearchPage = {
  title: string; description: string; url: string; markdown: string;
  aliases: readonly string[]; sections: readonly { title: string; url: string }[];
};
export type SearchResult = { title: string; heading: string; url: string; excerpt: string; score: number };
const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase();
export function searchManual(pages: readonly SearchPage[], query: string): SearchResult[] {
  const terms = normalize(query).trim().split(/\s+/u).filter(Boolean);
  if (!terms.length) return [];
  return pages.flatMap(page => {
    const blocks = page.markdown.split(/^##\s+/m).slice(1);
    return page.sections.flatMap((section, index) => {
      const body = blocks[index]?.replace(/^[^\n]*\n/, '').trim() ?? page.description;
      const title = normalize(`${page.title} ${section.title}`);
      const aliases = normalize(page.aliases.join(' '));
      const text = normalize(body);
      if (!terms.every(term => title.includes(term) || aliases.includes(term) || text.includes(term))) return [];
      const score = terms.reduce((sum, term) => sum + (title.includes(term) ? 10 : text.includes(term) ? 3 : 1), 0);
      const plain = body.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[`#*>|]/g, '').replace(/\s+/g, ' ');
      const hit = normalize(plain).indexOf(terms[0]!);
      const start = Math.max(0, hit - 24);
      return [{ title: page.title, heading: section.title, url: page.url + section.url,
        excerpt: `${start ? '…' : ''}${plain.slice(start, start + 100)}`, score }];
    });
  }).sort((a, b) => b.score - a.score || a.url.localeCompare(b.url)).slice(0, 10);
}
