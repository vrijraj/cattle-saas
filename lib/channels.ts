export async function sendChannel(channel: "whatsapp" | "sms", text: string) {
  const token = channel === "whatsapp" ? process.env.WHATSAPP_TOKEN : process.env.SMS_TOKEN;
  const url = channel === "whatsapp" ? process.env.WHATSAPP_API_URL : process.env.SMS_API_URL;
  if (!token || !url) return { channel, ok: false, detail: `${channel} is not configured` };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return { channel, ok: response.ok, detail: response.ok ? "Sent" : `Provider returned ${response.status}` };
  } catch {
    return { channel, ok: false, detail: "The provider could not be reached" };
  }
}
