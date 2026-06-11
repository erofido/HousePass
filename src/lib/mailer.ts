/**
 * Thin email sender (Resend HTTP API — no SDK needed). When RESEND_API_KEY
 * is not configured the email is logged instead, and the caller is told so
 * it can decide whether to mark the alert as delivered.
 */
export async function sendEmail(
  to: string[],
  subject: string,
  html: string,
): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL;

  if (!apiKey || !from) {
    console.log(`[mailer disabled] To: ${to.join(", ")} — ${subject}`);
    return { sent: false, reason: "not_configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Email send failed (${res.status}): ${body}`);
      return { sent: false, reason: `provider_${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.error("Email send failed:", e);
    return { sent: false, reason: "network" };
  }
}
