import { expect, test } from "@playwright/test";

const answers = ["Frontend Developer", "Baru mulai", "6 jam per minggu", "3 bulan", "Belajar lewat membangun proyek"];

test("signup, sign-in, study plan, and mentor chat", async ({ page }) => {
  const email = `navi.e2e.${Date.now()}@example.com`;
  const password = "rahasia-navi";

  await page.goto("/");
  await page.getByRole("button", { name: /Buat rencana belajarku/ }).click();
  for (const [index, answer] of answers.entries()) {
    await page.getByRole("button", { name: answer, exact: true }).click();
    await page.getByRole("button", { name: index < answers.length - 1 ? /^Lanjut/ : /Lihat ringkasan/ }).click();
  }
  await page.getByRole("button", { name: /Simpan rencana dengan akun/ }).click();
  await expect(page.getByRole("heading", { name: "Buat akun untuk mulai." })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  const passwords = page.locator("input[autocomplete='new-password']");
  await passwords.nth(0).fill(password);
  await passwords.nth(1).fill(password);
  await page.getByRole("button", { name: /Buat akun & simpan rencana/ }).click();

  await expect(page.getByRole("heading", { name: /Satu langkah untuk Frontend Developer/ })).toBeVisible();
  const nav = page.locator(".sidebar");
  await nav.getByRole("link", { name: "Rencana" }).click();
  await expect(page.getByRole("heading", { name: "Fondasi antarmuka" })).toBeVisible();

  await nav.getByRole("link", { name: "Chat" }).click();
  await page.getByLabel("Pesan untuk Navi").fill("Aku bingung mulai dari mana.");
  await page.getByRole("button", { name: "Kirim pesan" }).click();
  await expect(page.getByText("Langkah berikutnya:")).toBeVisible();

  await nav.getByRole("button", { name: "Keluar akun" }).click();
  await expect(page.getByRole("button", { name: /Buat rencana belajarku/ })).toBeVisible();
  await expect(async () => {
    await page.getByRole("button", { name: /^Masuk/ }).click();
    await expect(page).toHaveURL(/\/login/);
  }).toPass();
  await page.getByLabel("Email").fill(email);
  await page.locator("input[autocomplete='current-password']").fill(password);
  await page.getByRole("button", { name: /^Masuk/ }).click();
  await expect(page.getByRole("heading", { name: /Satu langkah untuk Frontend Developer/ })).toBeVisible();
});
