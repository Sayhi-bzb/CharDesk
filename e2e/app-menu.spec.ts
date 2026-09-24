import { expect, test } from '@playwright/test';

test.describe('App menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('chardesk-onboarding-v1', 'completed');
    });
  });

  test('shows the same-origin GitHub Star snapshot when the menu opens', async ({ page }) => {
    let requests = 0;
    await page.route('**/api/github-stars', async (route) => {
      requests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: 1234, updatedAt: '2026-09-23T12:00:00.000Z' }),
      });
    });
    await page.goto('/');
    expect(requests).toBe(0);
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByRole('menuitem', { name: /GitHub.*1,234/ })).toBeVisible();
    expect(requests).toBe(1);
  });

  test('round-trips a native CharDesk project file', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Select canvas' }).click();
    await page
      .getByRole('button', { name: /^Manage / })
      .first()
      .click();
    await page.getByRole('menuitem', { name: 'Export' }).hover();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'CharDesk' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^chardesk-\d+\.chardesk$/);
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    if (!downloadPath) return;

    await page.locator('input[type="file"]').first().setInputFiles(downloadPath);
    await expect(page.locator('[data-canvas-session-row]')).toHaveCount(3);
  });

  test('keeps inline actions open and closes when focus leaves', async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const trigger = page.getByRole('button', { name: 'Open menu' });
    const menuContent = page.locator('[data-slot="dropdown-menu-content"]');
    const canvasBreadcrumb = page.getByRole('button', { name: 'Select canvas' });
    await expect(trigger).toBeVisible();
    await expect(page.locator('[data-slot="sidebar-footer"]')).toHaveCount(0);

    const gridControl = page.getByTestId('zoom-grid');
    const minimapControl = page.getByRole('button', { name: 'Minimap' });
    await expect(gridControl).toHaveAttribute('aria-pressed', 'false');
    await gridControl.click();
    await expect(gridControl).toHaveAttribute('aria-pressed', 'true');
    await minimapControl.click();
    const minimap = page.getByLabel('Canvas minimap');
    await expect(minimap).toBeVisible();
    const minimapBox = await minimap.boundingBox();
    const minimapControlBox = await minimapControl.boundingBox();
    expect(minimapBox).not.toBeNull();
    expect(minimapControlBox).not.toBeNull();
    expect(minimapBox!.y + minimapBox!.height).toBeLessThan(minimapControlBox!.y);

    const triggerBox = await trigger.boundingBox();
    const breadcrumbBox = await canvasBreadcrumb.boundingBox();
    expect(triggerBox).not.toBeNull();
    expect(breadcrumbBox).not.toBeNull();
    expect(triggerBox!.x + triggerBox!.width).toBeLessThanOrEqual(breadcrumbBox!.x);

    await trigger.click();
    const menu = page.getByRole('menu', { name: 'Open menu' });
    await expect(menu).toBeVisible();
    for (const name of ['Split', 'Zen', 'Clear canvas', 'Settings', 'Help', 'GitHub']) {
      await expect(menu.getByRole('menuitem', { name: new RegExp(`^${name}`) })).toBeVisible();
    }

    const separator = menu.locator('[data-slot="dropdown-menu-separator"]');
    await expect(separator).toHaveCount(1);
    await expect(separator).toHaveCSS('height', '2px');
    await expect(separator).toHaveClass(/rounded-full/, /bg-separator/);

    await page.mouse.click(700, 500);
    await expect(menuContent).toHaveCount(0);

    await trigger.click();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(menuContent).toHaveCount(0);

    const securityControl = page.getByRole('button', { name: 'Data security' });
    const securityBox = await securityControl.boundingBox();
    expect(securityBox).not.toBeNull();
    expect(securityBox!.x + securityBox!.width).toBe(1428);
    expect(securityBox!.y + securityBox!.height).toBe(888);
    await expect(page.locator('[data-slot="sidebar-content"]')).toHaveCSS('padding-bottom', '0px');

    await securityControl.click();
    await expect(page.getByRole('dialog')).toContainText('Data security');
    await page.keyboard.press('Escape');

    await trigger.click();
    await page
      .getByRole('menu', { name: 'Open menu' })
      .getByRole('menuitem', { name: 'Clear canvas' })
      .click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(menuContent).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('hides every split-pane widget in Zen and restores pane state', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('chardesk-canvas-split-enabled', 'true');
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const trigger = page.getByRole('button', { name: 'Open menu' });
    const sideRegion = page.locator('[data-editor-chrome-region="side-end"]');
    await expect(page.getByRole('button', { name: 'Select canvas' })).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Toggle inspector' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zoom out' })).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Canvas tools' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Data security' })).toBeVisible();
    await expect(sideRegion).toBeVisible();

    const primaryView = page.getByTestId('canvas-view-primary');
    const secondaryView = page.getByTestId('canvas-view-secondary');
    const primarySelector = page.getByTestId('canvas-session-selector-primary');
    const secondarySelector = page.getByTestId('canvas-session-selector-secondary');
    await expect(primaryView).toBeVisible();
    await expect(secondaryView).toBeVisible();
    await expect(primarySelector).toBeVisible();
    await expect(secondarySelector).toBeVisible();
    const primarySessionId = await primaryView.getAttribute('data-session-id');
    const secondarySessionId = await secondaryView.getAttribute('data-session-id');

    await trigger.click();
    await page.getByRole('menuitem', { name: 'Zen' }).click();

    await expect(trigger).toBeVisible();
    await expect(primarySelector).toHaveCount(0);
    await expect(secondarySelector).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Toggle inspector' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Zoom out' })).toHaveCount(0);
    await expect(page.getByRole('toolbar', { name: 'Canvas tools' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Data security' })).toHaveCount(0);
    await expect(sideRegion).toHaveCount(0);
    await expect(primaryView).toBeVisible();
    await expect(secondaryView).toBeVisible();
    await expect(page.getByRole('separator', { name: 'Resize canvas views' })).toBeVisible();
    await expect(page.getByTestId('app-top-bar')).toHaveAttribute('data-zen-mode', 'true');

    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('menuitem', { name: 'Exit Zen' }).click();

    await expect(primarySelector).toBeVisible();
    await expect(secondarySelector).toBeVisible();
    await expect(primaryView).toHaveAttribute('data-session-id', primarySessionId ?? '');
    await expect(secondaryView).toHaveAttribute('data-session-id', secondarySessionId ?? '');
    await expect(page.getByRole('button', { name: 'Toggle inspector' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zoom out' })).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Canvas tools' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Data security' })).toBeVisible();
    await expect(sideRegion).toBeVisible();
  });

  test('auto-detects imports and exposes language and shortcuts in Settings', async ({ page }) => {
    const outdatedOptimizedDependencies: string[] = [];
    page.on('response', (response) => {
      if (response.status() === 504) {
        outdatedOptimizedDependencies.push(response.url());
      }
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const trigger = page.getByTestId('app-menu-host').getByRole('button');
    const selector = page.getByRole('button', { name: 'Select canvas' });
    await selector.click();
    await page.getByRole('button', { name: 'Import' }).click();
    await expect(page.locator('input[type="file"]').first()).toHaveAttribute(
      'accept',
      '.chardesk,.slides.md,.ans,.txt'
    );
    await page.keyboard.press('Escape');
    await selector.click();
    await expect(page.getByRole('dialog', { name: 'Select canvas' })).toBeHidden();

    await trigger.click();
    const menu = page.getByRole('menu', { name: 'Open menu' });
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Settings' }).click();

    const settings = page.getByRole('dialog', { name: 'Settings' });
    await expect(settings).toBeVisible();
    expect(outdatedOptimizedDependencies).toEqual([]);
    await expect(settings.getByRole('button', { name: 'Close' })).toHaveCount(0);
    await settings.getByRole('combobox', { name: 'Language' }).click();
    const languageOptions = page.getByRole('listbox');
    await expect(languageOptions).toBeVisible();
    await languageOptions.getByRole('option', { name: '中文' }).click();
    await expect(page.getByRole('dialog', { name: '设置' })).toBeVisible();

    await page.getByRole('button', { name: '快捷键' }).click();
    await expect(
      page.getByRole('dialog', { name: '设置' }).locator('[data-slot="shortcut-grid"]')
    ).toBeVisible();

    const overlay = page.locator('[data-slot="dialog-overlay"]');
    await overlay.click({ position: { x: 4, y: 4 } });
    await expect(settings).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('keeps shared controls stable and opens selector actions toward available space', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const selector = page.getByRole('button', { name: 'Select canvas' });
    const restingBox = await selector.boundingBox();
    expect(restingBox).not.toBeNull();
    await page.mouse.move(
      restingBox!.x + restingBox!.width / 2,
      restingBox!.y + restingBox!.height / 2
    );
    await page.mouse.down();
    await expect(selector).toHaveCSS('transform', 'none');
    const pressedBox = await selector.boundingBox();
    expect(pressedBox).toEqual(restingBox);
    await page.mouse.up();

    const newTrigger = page.getByRole('button', { name: 'New' });
    await newTrigger.click();
    const newMenu = page.getByRole('menu', { name: 'New' });
    const newTriggerBox = await newTrigger.boundingBox();
    const newMenuBox = await newMenu.boundingBox();
    expect(newTriggerBox).not.toBeNull();
    expect(newMenuBox).not.toBeNull();
    expect(newMenuBox!.x).toBeGreaterThanOrEqual(newTriggerBox!.x + newTriggerBox!.width - 1);

    await page.setViewportSize({ width: 320, height: 720 });
    await page.reload();
    await selector.click();
    await page.getByRole('button', { name: 'Import' }).click();
    const importMenu = page.getByRole('menu', { name: 'Import' });
    await expect(importMenu).toHaveAttribute('data-side', 'bottom');
    const importMenuBox = await importMenu.boundingBox();
    expect(importMenuBox).not.toBeNull();
    expect(importMenuBox!.width).toBeLessThanOrEqual(176);
    expect(importMenuBox!.x).toBeGreaterThanOrEqual(0);
    expect(importMenuBox!.x + importMenuBox!.width).toBeLessThanOrEqual(320);
  });

  test('switches Settings sections through the phone Select navigation', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto('/');

    await page.getByRole('button', { name: 'Open menu' }).click();
    await page
      .getByRole('menu', { name: 'Open menu' })
      .getByRole('menuitem', { name: 'Settings' })
      .click();

    const settings = page.getByRole('dialog', { name: 'Settings' });
    const sectionSelect = settings.getByRole('combobox', { name: 'Settings sections' });
    await sectionSelect.click();
    const sectionOptions = page.getByRole('listbox');
    await expect(sectionOptions).toBeVisible();
    await sectionOptions.getByRole('option', { name: 'Shortcuts' }).click();
    await expect(settings.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible();
  });

  test('keeps every Settings table column inside the phone content width', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');

    await page.getByRole('button', { name: 'Open menu' }).click();
    await page
      .getByRole('menu', { name: 'Open menu' })
      .getByRole('menuitem', { name: 'Settings' })
      .click();

    const settings = page.getByRole('dialog', { name: 'Settings' });
    const content = settings.locator('[data-slot="settings-content"]');
    const sectionScroll = () => settings.locator('[data-slot="settings-section-scroll"]');
    const expectWidthContained = async (target: ReturnType<typeof sectionScroll>) => {
      const metrics = await target.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollLeft: element.scrollLeft,
        scrollWidth: element.scrollWidth,
      }));
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
      expect(metrics.scrollLeft).toBe(0);
    };

    await expectWidthContained(sectionScroll());

    const sectionSelect = settings.getByRole('combobox', { name: 'Settings sections' });
    await sectionSelect.click();
    await page.getByRole('listbox').getByRole('option', { name: 'Display' }).click();
    await expect(settings.getByRole('columnheader', { name: 'Setting' })).toBeVisible();
    await expect(settings.getByRole('columnheader', { name: 'Value' })).toBeVisible();
    await expect(settings.getByRole('columnheader', { name: 'Color' })).toBeVisible();
    await expectWidthContained(sectionScroll());
    await expectWidthContained(settings.locator('[data-slot="display-settings-grid"]'));

    await sectionSelect.click();
    await page.getByRole('listbox').getByRole('option', { name: 'Shortcuts' }).click();
    await expect(settings.getByRole('columnheader', { name: 'Command' })).toBeVisible();
    await expect(settings.getByRole('columnheader', { name: 'Scope' })).toBeVisible();
    await expect(settings.getByRole('columnheader', { name: 'Shortcut' })).toBeVisible();
    await expectWidthContained(sectionScroll());
    await expectWidthContained(settings.locator('[data-slot="shortcut-grid"]'));

    await settings.getByRole('searchbox', { name: 'Search settings' }).fill('Undo');
    await settings
      .getByRole('navigation', { name: 'Settings search results' })
      .getByRole('button', { name: 'Undo' })
      .click();
    await expect(content).toBeVisible();
    await expectWidthContained(sectionScroll());
  });

  test('switches directly from the compact selector to side navigation at md', async ({ page }) => {
    await page.setViewportSize({ width: 767, height: 720 });
    await page.goto('/');

    await page.getByRole('button', { name: 'Open menu' }).click();
    await page
      .getByRole('menu', { name: 'Open menu' })
      .getByRole('menuitem', { name: 'Settings' })
      .click();

    const settings = page.getByRole('dialog', { name: 'Settings' });
    const compactNavigation = settings.locator('[data-slot="settings-navigation-mobile"]');
    const sideNavigation = settings.locator('[data-slot="settings-navigation-inline"]');
    const content = settings.locator('[data-slot="settings-content"]');

    await expect(compactNavigation).toBeVisible();
    await expect(sideNavigation).toBeHidden();

    await page.setViewportSize({ width: 768, height: 720 });
    await expect(compactNavigation).toBeHidden();
    await expect(sideNavigation).toBeVisible();

    const sideBox = await sideNavigation.boundingBox();
    const contentBox = await content.boundingBox();
    expect(sideBox).not.toBeNull();
    expect(contentBox).not.toBeNull();
    expect(contentBox!.x).toBeGreaterThan(sideBox!.x + sideBox!.width);

    await sideNavigation.getByRole('button', { name: 'Display' }).click();
    await expect(settings.getByRole('heading', { name: 'Display' })).toBeVisible();
    const sectionMetrics = await settings
      .locator('[data-slot="settings-section-scroll"]')
      .evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
    expect(sectionMetrics.scrollWidth).toBeLessThanOrEqual(sectionMetrics.clientWidth + 1);

    await page.setViewportSize({ width: 1024, height: 720 });
    await expect(compactNavigation).toBeHidden();
    await expect(sideNavigation).toBeVisible();
  });
});
