import { expect, test, type Page } from '@playwright/test';

const ONBOARDING_STORAGE_KEY = 'chardesk-onboarding-v1';
const TOUR_TRANSITION_MS = 350;

test.use({
  storageState: {
    cookies: [],
    origins: [],
  },
});

test('restarts the guide from the app menu without a Help dialog', async ({ page }) => {
  await page.addInitScript((storageKey) => {
    localStorage.setItem(storageKey, 'completed');
  }, ONBOARDING_STORAGE_KEY);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  await expect(page.locator('.chardesk-onboarding')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Help' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Data security' })).toBeVisible();

  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('menuitem', { name: 'Help' }).hover();
  await page.getByRole('menuitem', { name: 'Guide' }).click();

  const popover = page.getByRole('dialog', { name: 'Create on the canvas' });
  await expect(popover).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('menu')).toHaveCount(0);
});

async function reachDragStep(page: Page, testWrongClicks = false) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const popover = page.locator('.chardesk-onboarding');
  await expect(popover.getByText("Create on the canvas")).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.onboardingPhase))
    .toBe("welcome");
  const welcomeVisual = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>(".chardesk-onboarding");
    const canvas = document.querySelector<HTMLElement>(
      "[data-onboarding-target=\"canvas\"]",
    );
    const dummy = document.querySelector<HTMLElement>("#driver-dummy-element");
    const overlayPath = document.querySelector<SVGPathElement>(".driver-overlay path");
    if (!card || !canvas || !dummy || !overlayPath) return null;

    const cardBox = card.getBoundingClientRect();
    return {
      canvasActive: canvas.classList.contains("driver-active-element"),
      dummyActive: dummy.classList.contains("driver-active-element"),
      overlayFill: getComputedStyle(overlayPath).fill,
      overlayToken: getComputedStyle(document.documentElement)
        .getPropertyValue("--dialog-overlay")
        .trim(),
      overlayOpacity: Number(getComputedStyle(overlayPath).opacity),
      centerOffsetX: Math.abs(
        cardBox.left + cardBox.width / 2 - window.innerWidth / 2,
      ),
      centerOffsetY: Math.abs(
        cardBox.top + cardBox.height / 2 - window.innerHeight / 2,
      ),
      arrowHidden: card.querySelector(".driver-popover-arrow-none") !== null,
    };
  });
  expect(welcomeVisual).not.toBeNull();
  expect(welcomeVisual!.canvasActive).toBe(false);
  expect(welcomeVisual!.dummyActive).toBe(true);
  expect(welcomeVisual!.overlayFill).toBe(welcomeVisual!.overlayToken);
  expect(welcomeVisual!.overlayOpacity).toBe(1);
  expect(welcomeVisual!.centerOffsetX).toBeLessThanOrEqual(2);
  expect(welcomeVisual!.centerOffsetY).toBeLessThanOrEqual(2);
  expect(welcomeVisual!.arrowHidden).toBe(true);

  await popover.getByRole("button", { name: "Next" }).click();
  await expect(popover.getByText('Characters')).toBeVisible();
  const characterRail = page.locator(
    '[data-onboarding-target="character-library"]',
  );
  await expect(characterRail).toBeVisible();
  await expect(characterRail).toHaveClass(/driver-active-element/);

  if (testWrongClicks) {
    await page.mouse.click(900, 780);
    await expect(popover.getByText('Characters')).toBeVisible();

    const zoomInBounds = await page.getByRole('button', { name: 'Zoom in' }).boundingBox();
    expect(zoomInBounds).not.toBeNull();
    await page.mouse.click(
      zoomInBounds!.x + zoomInBounds!.width / 2,
      zoomInBounds!.y + zoomInBounds!.height / 2,
    );
    await expect(popover.getByText('Characters')).toBeVisible();
  }

  const editorStateBeforeLibrary = await page.evaluate(() =>
    localStorage.getItem('chardesk-persistence'),
  );
  await expect(page.getByRole('tab', { name: 'Nerd Icons' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Emoji' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Unicode' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Essentials' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await popover.getByRole('button', { name: 'Next' }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('chardesk-persistence')))
    .toBe(editorStateBeforeLibrary);
  await expect(popover.getByText('Canvas type')).toBeVisible();
  await page.waitForTimeout(TOUR_TRANSITION_MS);
  await page.locator('[data-onboarding-target="canvas-selector"]').click();
  await expect(popover.getByText('New canvas')).toBeVisible();
  await page.waitForTimeout(TOUR_TRANSITION_MS);
  await page.locator('[data-onboarding-target="create-menu"]').click();
  await expect(popover.getByText('Structured canvas', { exact: true })).toBeVisible();
  await page.waitForTimeout(TOUR_TRANSITION_MS);
  await page.locator('[data-onboarding-target="create-structured"]').click();

  await expect(popover.getByText('Button', { exact: true })).toBeVisible();
  await popover.getByRole('button', { name: 'Next' }).click();
  await expect(popover.getByText('Add the button')).toBeVisible();
  await page.waitForTimeout(TOUR_TRANSITION_MS);

  return popover;
}

test('keeps wrong clicks inside the guide and completes a real Button drag', async ({ page }) => {
  test.setTimeout(60_000);
  const popover = await reachDragStep(page, true);

  const template = page.locator('[data-onboarding-template-id="button"]');
  const canvas = page.locator("[data-onboarding-target=\"canvas\"]");
  const footerButton = popover.getByRole("button", { name: "Skip this step" });
  const guideSurface = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>(".chardesk-onboarding");
    const button = card?.querySelector<HTMLElement>(".driver-popover-footer-btn");
    if (!card || !button) return null;

    const cardStyle = getComputedStyle(card);
    const buttonStyle = getComputedStyle(button);
    return {
      cardBorderWidth: cardStyle.borderTopWidth,
      buttonBorderWidth: buttonStyle.borderTopWidth,
      buttonBackground: buttonStyle.backgroundColor,
    };
  });
  expect(guideSurface).not.toBeNull();
  expect(guideSurface!.cardBorderWidth).toBe("0px");
  expect(guideSurface!.buttonBorderWidth).toBe("0px");
  expect(guideSurface!.buttonBackground).not.toBe("rgba(0, 0, 0, 0)");

  await page.mouse.move(0, 0);
  await footerButton.evaluate((element) => element.blur());
  const restingButtonBackground = await footerButton.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await footerButton.hover();
  await expect
    .poll(() => footerButton.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(restingButtonBackground);
  const guideColors = await page.evaluate(() => {
    const templateElement = document.querySelector<HTMLElement>(
      "[data-onboarding-template-id=\"button\"]",
    );
    const canvasElement = document.querySelector<HTMLElement>(
      "[data-onboarding-target=\"canvas\"]",
    );
    if (!templateElement || !canvasElement) return null;

    const templateStyle = getComputedStyle(templateElement);
    const canvasColorLayer = getComputedStyle(canvasElement, "::after");
    return {
      templateBackground: templateStyle.backgroundColor,
      templateOutline: templateStyle.outlineStyle,
      templateShadow: templateStyle.boxShadow,
      templateAnimation: templateStyle.animationName,
      canvasBackground: canvasColorLayer.backgroundColor,
      canvasPointerEvents: canvasColorLayer.pointerEvents,
    };
  });
  expect(guideColors).not.toBeNull();
  expect(guideColors!.templateBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(guideColors!.templateOutline).toBe("none");
  expect(guideColors!.templateShadow).toBe("none");
  expect(guideColors!.templateAnimation).toBe("none");
  expect(guideColors!.canvasBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(guideColors!.canvasPointerEvents).toBe("none");
  const templateBounds = await template.boundingBox();
  const canvasBounds = await canvas.boundingBox();
  expect(templateBounds).not.toBeNull();
  expect(canvasBounds).not.toBeNull();

  await page.mouse.move(
    templateBounds!.x + templateBounds!.width / 2,
    templateBounds!.y + templateBounds!.height / 2,
  );
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.move(
    templateBounds!.x + templateBounds!.width / 2 - 16,
    templateBounds!.y + templateBounds!.height / 2,
    { steps: 4 },
  );
  await page.mouse.move(canvasBounds!.x + 640, canvasBounds!.y + 360, {
    steps: 20,
  });
  await page.waitForTimeout(100);
  await page.mouse.up();

  await expect(popover.getByText('Done', { exact: true })).toBeVisible();
  await popover.getByRole('button', { name: 'Start creating' }).click();
  await expect(popover).toHaveCount(0);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), ONBOARDING_STORAGE_KEY)).toBe('completed');

  await page.reload();
  await expect(popover).toHaveCount(0);
});

test('allows the drag step to be skipped without adding a component', async ({ page }) => {
  test.setTimeout(60_000);
  const popover = await reachDragStep(page);

  await popover.getByRole('button', { name: 'Skip this step' }).click();
  await expect(popover.getByText('Done', { exact: true })).toBeVisible();

  await popover.getByRole('button', { name: 'Start creating' }).click();
  await expect.poll(() =>
    page.evaluate((key) => localStorage.getItem(key), ONBOARDING_STORAGE_KEY)
  ).toBe('completed');
});
