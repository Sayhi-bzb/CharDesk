import { fileURLToPath } from 'node:url';
import { realpath } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const fixture = await realpath(fileURLToPath(new URL('./agent-dialog-fixture.ts', import.meta.url)));
test('Agent dialog shows independent channels and keyboard pairing on desktop and mobile', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/agent-dialog-test*', (route) => route.fulfill({
    contentType: 'text/html', body: `<div id="root"></div><script type="module" src="/@fs${fixture}"></script>`,
  }));
  await page.goto('/agent-dialog-test?ready=1');
  const dialog = page.getByRole('dialog', { name: 'Agent', exact: true });
  await expect.poll(async () => {
    if (errors.length) throw new Error(errors.join('\n'));
    return dialog.count();
  }).toBe(1);
  const local = dialog.getByRole('group', { name: 'Local MCP', exact: true });
  await expect(dialog.getByRole('group', { name: 'WebMCP', exact: true }).getByRole('status')).toHaveText('Ready');
  await expect(local.getByRole('status')).toHaveText('Not connected');
  await expect(dialog.getByLabel('Pairing URL')).not.toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('agent-channels.png'), animations: 'disabled' });
  await local.getByRole('button', { name: 'Pair', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(local.getByRole('button', { name: 'Pair', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await dialog.getByLabel('Pairing URL').fill('invalid');
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('alert')).toHaveText('Invalid pairing URL');
  await local.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(dialog.getByLabel('Pairing URL')).not.toBeVisible();
  await expect(dialog.getByRole('group', { name: 'WebMCP', exact: true }).getByRole('status')).toHaveText('Ready');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/agent-dialog-test?language=zh');
  await expect(dialog.getByRole('group', { name: 'WebMCP', exact: true }).getByRole('status')).toHaveText('不可用');
  await dialog.getByRole('button', { name: '配对', exact: true }).click();
  await expect(dialog.getByLabel('配对地址')).toBeVisible();
  expect(await dialog.evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('agent-pair-mobile-zh.png'), animations: 'disabled' });
});
