import nodemailer, { type Transporter } from "nodemailer";
import { getResend } from "@/lib/resend";

export interface EmailResult {
  success: boolean;
  message: string;
}

interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
}

let smtpTransport: Transporter | null = null;

function getSmtpTransport(): Transporter {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error("SMTP_USER and SMTP_PASS must be set for Gmail transport");
  }

  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user, pass },
    });
  }
  return smtpTransport;
}

function sendViaSmtp({ to, subject, html }: SendEmailArgs): Promise<EmailResult> {
  return getSmtpTransport()
    .sendMail({
      from: process.env.EMAIL_FROM ?? `Hearback <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    })
    .then(() => ({ success: true, message: "email successfully sent" }))
    .catch((error) => {
      console.error("SMTP failed to send email", error);
      return {
        success: false,
        message: error?.message ?? "Failed to send email.",
      };
    });
}

async function sendViaResend({
  to,
  subject,
  html,
}: SendEmailArgs): Promise<EmailResult> {
  try {
    const { data, error } = await getResend().emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
      to,
      subject,
      html,
    });

    if (error) {
      console.error("Resend failed to send email", error);
      return {
        success: false,
        message: error.message ?? "Failed to send email.",
      };
    }

    if (!data?.id) {
      console.error("Resend returned no email id");
      return { success: false, message: "Failed to send email." };
    }

    return { success: true, message: "email successfully sent" };
  } catch (error) {
    console.error("Error sending email via Resend", error);
    return { success: false, message: "Failed to send email." };
  }
}

export async function sendEmail(args: SendEmailArgs): Promise<EmailResult> {
  const provider = process.env.EMAIL_PROVIDER ?? "gmail";
  if (provider === "resend") {
    return sendViaResend(args);
  }
  return sendViaSmtp(args);
}