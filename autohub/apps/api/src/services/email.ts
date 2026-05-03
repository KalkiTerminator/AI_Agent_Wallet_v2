import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@autohub.app";
const WEB_URL = process.env.AUTOHUB_WEB_URL ?? "http://localhost:3000";

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const url = `${WEB_URL}/auth/verify-email?token=${token}`;
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Verify your AutoHub email",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
        <h2 style="font-size:20px;margin-bottom:8px">Verify your email</h2>
        <p style="color:#555;margin-bottom:24px">Click the button below to verify your AutoHub account. This link expires in 24 hours.</p>
        <a href="${url}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Verify Email</a>
        <p style="color:#999;font-size:12px;margin-top:24px">If you didn't create an account, you can ignore this email.</p>
      </div>
    `,
    text: `Verify your AutoHub email: ${url}\n\nThis link expires in 24 hours.`,
  });
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const url = `${WEB_URL}/auth/reset-password/${token}`;
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Reset your AutoHub password",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
        <h2 style="font-size:20px;margin-bottom:8px">Reset your password</h2>
        <p style="color:#555;margin-bottom:24px">Click the button below to reset your password. This link expires in 1 hour.</p>
        <a href="${url}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Reset Password</a>
        <p style="color:#999;font-size:12px;margin-top:24px">If you didn't request a reset, you can ignore this email.</p>
      </div>
    `,
    text: `Reset your AutoHub password: ${url}\n\nThis link expires in 1 hour.`,
  });
}
