import { test, expect } from "@playwright/test";

test("la lezione: apertura, tre Guardo, il Gioco, chiusura", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/dev/lezione?beat=apertura");
  await page.getByRole("button", { name: "Sediamoci" }).click();
  await expect(page).toHaveURL(/beat=guardo&n=1/);

  // Guardo 1: contesto, scacchiera, film, verdetto.
  await expect(page.locator(".lezione-contesto")).toBeVisible();
  const board = page.locator("[data-referee=board]");
  await expect(board).toBeVisible();
  const initialFen = await board.getAttribute("data-fen");
  await page.getByRole("button", { name: "Mossa successiva" }).click();
  await expect(board).not.toHaveAttribute("data-fen", initialFen ?? "");
  await page.getByRole("button", { name: "Mossa precedente" }).click();
  await expect(board).toHaveAttribute("data-fen", initialFen ?? "");
  await expect(page.locator(".lezione-verdetto")).toContainText("cavallo in e5");

  // Avanti x3: Guardo 2, Guardo 3, then the real Gioco.
  await page.getByRole("button", { name: "Avanti" }).click();
  await expect(page).toHaveURL(/beat=guardo&n=2/);
  await expect(page.locator(".lezione-step")).toContainText("2");
  await page.getByRole("button", { name: "Avanti" }).click();
  await expect(page).toHaveURL(/beat=guardo&n=3/);
  await expect(page.locator(".lezione-step")).toContainText("3");
  await page.getByRole("button", { name: "Avanti" }).click();
  await expect(page).toHaveURL(/beat=gioco/);
  await expect(page.locator("[data-referee=board]")).toBeVisible();

  // Play the moment's correct move (e5-f3 saves the knight), then exit straight to Chiusura.
  await page.locator('[data-square="e5"]').click();
  await page.locator('[data-square="f3"]').click();
  await expect(page.locator(".gioco-frase")).toContainText("Ecco. Stavolta l'hai vista.");
  await page.getByRole("button", { name: "Esci" }).click();
  await expect(page).toHaveURL(/beat=chiusura/);

  // Chiusura -> "Vai e gioca".
  const vaiEGioca = page.getByRole("button", { name: "Vai e gioca" });
  await expect(vaiEGioca).toBeVisible();
  await vaiEGioca.click();
  await expect(page).toHaveURL(/beat=apertura/);

  expect(errors).toEqual([]);
});

test("l'Apertura sta in un viewport a 360px, senza scroll", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/dev/lezione?beat=apertura");
  await expect(page.getByRole("button", { name: "Sediamoci" })).toBeVisible();
  const fits = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight);
  expect(fits).toBe(true);
});

test("il Ritorno porta la memoria delle partite nuove", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dev/lezione?beat=ritorno");
  await expect(page.getByText(/4 volte su 5/)).toBeVisible();
});
