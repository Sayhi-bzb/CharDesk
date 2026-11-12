import { describe, expect, it } from 'vitest';
import { searchManual } from '../../apps/docs/reader/search';
import { legacyDocRoutes, legacyDocRedirects } from './legacy-routes.mjs';

const page = { title: '选择与移动', description: '操作画布内容', url: '/editing/selection/', aliases: ['copy', 'paste'],
  sections: [{ title: '移动视图', url: '#移动视图' }, { title: '复制与删除', url: '#复制与删除' }],
  markdown: '## 移动视图\n\nHand 拖动视图。\n\n## 复制与删除\n\n复制选区，然后在目标位置粘贴。',
};
describe('human manual search', () => {
  it('ranks the matching heading and returns the actual section anchor', () => {
    expect(searchManual([page], '复制')[0]).toMatchObject({ heading: '复制与删除', url: '/editing/selection/#复制与删除' });
  });
  it('accepts operation aliases, case and full-width input', () => {
    expect(searchManual([page], 'ＣＯＰＹ')[0]?.title).toBe('选择与移动');
  });
  it('supports multi-term body queries without unrelated results', () => {
    expect(searchManual([page], '复制 目标')[0]?.heading).toBe('复制与删除');
    expect(searchManual([page], '复制 火星')).toEqual([]);
    expect(searchManual([page], '   ')).toEqual([]);
  });
  it('bounds results and removes Markdown link targets from excerpts', () => {
    const pages = Array.from({ length: 20 }, (_, index) => ({ ...page, url: `/page-${index}/`, markdown: page.markdown.replace('复制选区', '[复制选区](https://example.com/private-path)') }));
    const results = searchManual(pages, '复制');
    expect(results).toHaveLength(10);
    expect(results[0].excerpt).not.toContain('https://');
  });
});
describe('documentation migration', () => {
  it('gives every legacy human page an explicit destination', () => {
    const routes = legacyDocRoutes();
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.find(route => route.from === '/docs/user/collaboration')?.to).toBe('https://docs.chardesk.com/collaboration/');
    expect(routes.find(route => route.from === '/docs/development/cell-ui/compositor')?.to).toContain('/apps/docs/content/docs/development/cell-ui/compositor.mdx');
    expect(new Set(routes.map(route => route.from)).size).toBe(routes.length);
  });
  it('keeps resource URLs outside redirect patterns and supports both trailing-slash forms', () => {
    const redirects = legacyDocRedirects();
    expect(redirects).toContain('/docs https://docs.chardesk.com/ 301');
    expect(redirects).toContain('/docs/ https://docs.chardesk.com/ 301');
    expect(redirects).not.toContain('/docs/*');
    expect(redirects).not.toContain('/llms');
    expect(redirects).not.toContain('/api/search');
  });
});
