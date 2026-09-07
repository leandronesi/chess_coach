import { test, expect } from "@playwright/test";

test("il Quaderno: righe con le frasi, dettaglio, prova, i due details, Aggiorna", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/dev/lezione?beat=quaderno");

  // "Quello che torna": both synthetic patterns, each frase in the row (§A of the slice-4 spec).
  const hangingPieceRow = page.getByRole("button", { name: /Pezzi in presa/ });
  await expect(hangingPieceRow).toBeVisible();
  await expect(hangingPieceRow).toContainText("volte in");
  await expect(hangingPieceRow).toContainText("Ci stiamo lavorando da oggi.");

  const timeReserveRow = page.getByRole("button", { name: /Il tempo che hai/ });
  await expect(timeReserveRow).toBeVisible();
  await expect(timeReserveRow).toContainText("hai mosso in pochi secondi con il tempo in riserva");
  await expect(timeReserveRow).toContainText("Sono poche occasioni: non lo chiamo ancora un'abitudine.");

  // "Come sta andando" and "Tu" are on the same screen, with Aggiorna enabled.
  await expect(page.getByText("Come sta andando")).toBeVisible();
  const aggiorna = page.getByRole("button", { name: "Aggiorna", exact: true });
  await expect(aggiorna).toBeVisible();
  await expect(aggiorna).toBeEnabled();

  // Apertura del dettaglio.
  await hangingPieceRow.click();
  await expect(page).toHaveURL(/beat=quaderno-pattern/);
  await expect(page.getByRole("heading", { name: "Pezzi in presa" })).toBeVisible();
  await expect(page.getByText("Le prove")).toBeVisible();

  // I due details: chiusi di default, si aprono.
  const dettagli = page.locator(".quaderno-details");
  await expect(dettagli).toHaveCount(2);
  const livelloBody = dettagli.nth(0).locator("p");
  const numeriFirstLine = dettagli.nth(1).locator("li").first();
  await expect(livelloBody).toBeHidden();
  await expect(numeriFirstLine).toBeHidden();
  await dettagli.nth(0).locator("summary").click();
  await expect(livelloBody).toBeVisible();
  await dettagli.nth(1).locator("summary").click();
  await expect(numeriFirstLine).toBeVisible();

  // Apertura della prova: scacchiera visibile, nessun bottone in fondo, back "Quaderno".
  await page.locator(".quaderno-prova-row").first().click();
  await expect(page).toHaveURL(/beat=quaderno-momento/);
  await expect(page.locator("[data-referee=board]")).toBeVisible();
  await expect(page.locator(".lezione-foot")).toHaveCount(0);
  await expect(page.locator(".lezione-back")).toContainText("Quaderno");

  expect(errors).toEqual([]);
});

test("il Quaderno a 360px non genera scroll orizzontale", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/dev/lezione?beat=quaderno");
  await expect(page.getByRole("button", { name: /Pezzi in presa/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
