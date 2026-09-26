import { expect, test } from "@playwright/test";

test.use({
  storageState: {
    cookies: [],
    origins: [],
  },
});

async function createSlideDeck(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    localStorage.setItem("chardesk-onboarding-v1", "dismissed");
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Select canvas" }).click();
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByRole("menuitem", { name: "New Slides" }).hover();
  await page.getByRole("menuitem", { name: "Widescreen · 100 × 27" }).click();
  await expect(page.getByRole("button", { name: "Add slide" })).toBeVisible();
}

const getSlideNames = (page: import("@playwright/test").Page) =>
  page
    .getByRole("textbox", { name: "Rename" })
    .evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value)
    );

test("reorders slides by card, keyboard, and edge auto-scroll", async ({
  page,
}) => {
  await createSlideDeck(page);
  const addSlide = page.getByRole("button", { name: "Add slide" });
  await addSlide.click();
  await addSlide.click();

  const cards = page.locator("[data-reorder-card]");
  await expect(cards).toHaveCount(3);
  const sourceBox = await cards.nth(0).boundingBox();
  const targetBox = await cards.nth(2).boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(
    sourceBox!.x + sourceBox!.width / 2,
    sourceBox!.y + sourceBox!.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox!.x + targetBox!.width / 2,
    targetBox!.y + targetBox!.height / 2
  );
  await expect
    .poll(() =>
      cards.evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).transform)
      )
    )
    .toEqual([
      expect.not.stringMatching(/^none$/),
      expect.not.stringMatching(/^none$/),
      expect.not.stringMatching(/^none$/),
    ]);
  await page.mouse.up();
  await expect.poll(() => getSlideNames(page)).toEqual([
    "Slide 2",
    "Slide 3",
    "Slide 1",
  ]);
  await expect
    .poll(() =>
      cards.evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).transform)
      )
    )
    .toEqual(["none", "none", "none"]);
  await expect(page.getByRole("button", { name: "2. Slide 3" })).toHaveAttribute(
    "aria-current",
    "page"
  );

  const slideOneCard = page.getByRole("listitem", {
    name: "Reorder Slide 1, position 3 of 3",
  });
  await slideOneCard.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect.poll(() => getSlideNames(page)).toEqual([
    "Slide 2",
    "Slide 1",
    "Slide 3",
  ]);
  await expect(page.getByRole("button", { name: "3. Slide 3" })).toHaveAttribute(
    "aria-current",
    "page"
  );

  for (let index = 0; index < 8; index += 1) await addSlide.click();
  const viewport = page.locator(
    '[data-testid="sidebar-view-content"] [data-radix-scroll-area-viewport]'
  );
  await viewport.evaluate((element) => {
    element.scrollTop = 0;
  });
  const firstCard = cards.first();
  const cardBox = await firstCard.boundingBox();
  const viewportBox = await viewport.boundingBox();
  expect(cardBox).not.toBeNull();
  expect(viewportBox).not.toBeNull();

  await page.mouse.move(
    cardBox!.x + cardBox!.width / 2,
    cardBox!.y + cardBox!.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    cardBox!.x + cardBox!.width / 2,
    viewportBox!.y + viewportBox!.height - 8
  );
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await page.mouse.up();

  await page.getByRole("button", { name: "Duplicate" }).first().click();
  await expect(cards).toHaveCount(12);
});
