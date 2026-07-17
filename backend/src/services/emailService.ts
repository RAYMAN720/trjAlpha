type AccessCodeEmailParams = {
  to: string;
  code: string;
  expiresAt: Date;
};

type EmailDeliveryResult = {
  sent: boolean;
  provider: "resend" | "development";
};

export function getOwnerEmail() {
  return (process.env.APP_OWNER_EMAIL?.trim() || "rayanntchamba@gmail.com").toLowerCase();
}

export function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!name || !domain) return "configured owner email";
  const visible = name.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(3, name.length - 2))}@${domain}`;
}

export function emailDeliveryConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendAccessCodeEmail({ to, code, expiresAt }: AccessCodeEmailParams): Promise<EmailDeliveryResult> {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();

  if (!resendApiKey) {
    return { sent: false, provider: "development" };
  }

  const from = process.env.APP_EMAIL_FROM?.trim() || "TradePilot AI <onboarding@resend.dev>";
  const expiresInMinutes = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 60_000));
  const subject = "Your TradePilot AI access code";
  const text = [
    `Your TradePilot AI access code is ${code}.`,
    `It expires in ${expiresInMinutes} minutes.`,
    "If you did not request this, ignore this email."
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827;">
      <p>Your TradePilot AI access code is:</p>
      <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">${code}</p>
      <p>This code expires in ${expiresInMinutes} minutes.</p>
      <p>If you did not request this, ignore this email.</p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
      html
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Email provider rejected the access-code email with status ${response.status}. ${body.slice(0, 160)}`);
  }

  return { sent: true, provider: "resend" };
}
