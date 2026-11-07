/** Kirim email lewat Resend. Mengembalikan false bila key tidak ada atau Resend menolak. */
export async function sendResendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return false;
  const from = process.env.EMAIL_FROM?.trim() || "Navi <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) console.error("[navi] Resend error", res.status);
  return res.ok;
}
