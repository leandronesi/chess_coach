import { test, expect, type Page } from "@playwright/test";

/**
 * react-chessboard v5 drags pieces via dnd-kit's PointerSensor, which needs a
 * real pointer-move past its activation distance before it recognizes a drag —
 * Locator.dragTo()'s single big jump never crosses that threshold. A manual
 * down/move-in-steps/up sequence on the piece element does.
 */
async function dragSquare(page: Page, from: string, to: string) {
  const source = page.locator(`[data-square="${from}"] [data-piece]`);
  const target = page.locator(`[data-square="${to}"]`);
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error(`dragSquare: missing bounding box for ${from} or ${to}`);
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 5, sourceBox.y + sourceBox.height / 2, { steps: 5 });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 15 });
  await page.mouse.up();
}

test("Gioco: fermata su a3, Ripensaci, mossa buona, sfoglio, takeback, esci con esito 'ritirato'", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/dev/lezione?beat=gioco");
  const board = page.locator("[data-referee=board]");
  await expect(board).toBeVisible();
  await expect(page.locator(".lezione-frame")).toHaveCount(0);

  // The wrong move (a2-a3) stops the game before the bot replies.
  await page.locator('[data-square="a2"]').click();
  await page.locator('[data-square="a3"]').click();
  await expect(page.locator(".gioco-stop-card")).toBeVisible();
  await expect(page.locator(".gioco-stop-frase")).toContainText("Aspetta.");
  await expect(page.locator(".lezione-frame")).toHaveCount(1);

  // Ripensaci in the overlay: retracts the move and closes the overlay.
  await page.locator(".gioco-stop-card").getByRole("button", { name: "Ripensaci" }).click();
  await expect(page.locator(".gioco-stop-card")).toHaveCount(0);
  await expect(page.locator(".lezione-frame")).toHaveCount(0);

  // The good move (e5-f3) saves the knight: the bot replies.
  await page.locator('[data-square="e5"]').click();
  await page.locator('[data-square="f3"]').click();
  await expect(page.locator(".gioco-frase")).toContainText("Ecco. Stavolta l'hai vista.");
  await expect(page.locator(".lezione-frame")).toHaveCount(2);

  // One more legal move, this time by dragging — the bot replies again.
  await dragSquare(page, "h2", "h3");
  await expect(page.locator(".lezione-frame")).toHaveCount(4);

  // Browse one frame back: an earlier position shows, input is disabled.
  const liveFen = await board.getAttribute("data-fen");
  await page.getByRole("button", { name: "Mossa precedente" }).click();
  await expect(board).not.toHaveAttribute("data-fen", liveFen ?? "");
  await expect(board).toHaveAttribute("data-input-enabled", "false");

  // Forward back to the end: live position and input return.
  await page.getByRole("button", { name: "Mossa successiva" }).click();
  await expect(board).toHaveAttribute("data-fen", liveFen ?? "");
  await expect(board).toHaveAttribute("data-input-enabled", "true");

  // Ripensaci (row 6) takes back two plies (the bot's reply and the drag move).
  await page.locator('[data-cta="takeback"]').click();
  await expect(page.locator(".lezione-frame")).toHaveCount(2);

  // Esci: the first swing was wrong and taken back -> esito "ritirato", whatever the retry did.
  await page.getByRole("button", { name: "Esci" }).click();
  await expect(page).toHaveURL(/beat=chiusura/);
  await expect(page.getByText(/ma l'hai ritirata/)).toBeVisible();

  expect(errors).toEqual([]);
});

test("Gioco: un reload a meta' partita ripristina la lista mosse", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dev/lezione?beat=gioco");

  await page.locator('[data-square="e5"]').click();
  await page.locator('[data-square="f3"]').click();
  await expect(page.locator(".lezione-frame")).toHaveCount(2);

  await page.reload();
  await expect(page.locator("[data-referee=board]")).toBeVisible();
  await expect(page.locator(".lezione-frame")).toHaveCount(2);
});

test("Gioco a 360px: eval bar, orologio e scacchiera nel primo viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/dev/lezione?beat=gioco");
  await expect(page.locator("[data-referee=board]")).toBeVisible();

  const innerHeight = await page.evaluate(() => window.innerHeight);
  for (const selector of ["[data-referee=eval]", "[data-referee=clock]", "[data-referee=board]"]) {
    const bottom = await page.locator(selector).evaluate((el) => el.getBoundingClientRect().bottom);
    expect(bottom).toBeLessThanOrEqual(innerHeight);
  }
});
