import { expect, test } from '@playwright/test';

const agentDeck = [
  '---',
  'chardesk: document/v1',
  'mode: slide',
  'title: Agent Deck',
  '---',
  '## Intro',
  '```text',
  '  ASCII',
  '```',
  '## Next',
  '```chardesk',
  '[31mAgent -> Slides[0m',
  '```',
].join('\n');

test('imports an Agent-generated CharDesk deck and exposes one document export', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('menuitem', { name: 'File' }).hover();
  await expect(page.getByRole('menuitem', { name: 'Import' })).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: 'agent.chardesk',
    mimeType: 'text/plain',
    buffer: Buffer.from(agentDeck),
  });

  await expect(page.getByRole('button', { name: 'Add slide' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Rename' })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Slide 1 of 2: Intro, current' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Slide 2 of 2: Next' })).toBeVisible();

  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('menuitem', { name: 'File' }).hover();
  await page
    .getByRole('menuitem', { name: 'Export', exact: true })
    .evaluate((element) => (element as HTMLElement).click());
  await expect(page.getByRole('menuitem', { name: 'CharDesk', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Markdown', exact: true })).toHaveCount(0);
});
