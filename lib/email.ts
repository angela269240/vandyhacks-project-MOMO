import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * Outgoing mail over SMTP (OCI Email Delivery, Gmail with an app password, Resend, ...).
 * With SMTP_* unset the message is printed to the server log instead, so codes still work locally.
 */
export const emailConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);

let transport: Transporter | null = null;

export async function sendEmail(to: string, subject: string, text: string) {
  if (!emailConfigured()) {
    console.warn(`[email] SMTP not configured; would send to ${to}:\n  ${subject}\n  ${text.replace(/\n/g, "\n  ")}`);
    return;
  }
  const port = Number(process.env.SMTP_PORT || 587);
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  await transport.sendMail({ from: process.env.EMAIL_FROM || process.env.SMTP_USER, to, subject, text });
}
