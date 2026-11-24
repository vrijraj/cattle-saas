export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function sendMail(input: { to: string; subject: string; html: string }) {
  const token = process.env.ZEPTOMAIL_TOKEN;
  const from = process.env.ZEPTOMAIL_FROM;
  if (!token || !from) return { sent: false as const, reason: "not_configured" as const };
  try {
    const response = await fetch(process.env.ZEPTOMAIL_API_URL || "https://api.zeptomail.in/v1.1/email", {
      method: "POST",
      headers: {
        Authorization: `Zoho-enczapikey ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: { address: from },
        to: [{ email_address: { address: input.to } }],
        subject: input.subject,
        htmlbody: input.html,
      }),
    });
    if (!response.ok) {
      console.error(`ZeptoMail error: HTTP ${response.status}`);
      return { sent: false as const, reason: "error" as const };
    }
    return { sent: true as const };
  } catch (error) {
    console.error("ZeptoMail request failed:", error);
    return { sent: false as const, reason: "error" as const };
  }
}
