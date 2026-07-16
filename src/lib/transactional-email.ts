import "server-only";

import { createElement } from "react";
import { Resend } from "resend";

import { PasswordResetEmail } from "@/emails/password-reset-email";
import { VerificationEmail } from "@/emails/verification-email";
import { WelcomeEmail } from "@/emails/welcome-email";

const DEFAULT_FROM = "TalkSQL <onboarding@resend.dev>";

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Email delivery is not configured.");
  return new Resend(apiKey);
}

function appUrl() {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function logoUrl() {
  return process.env.RESEND_LOGO_URL ?? `${appUrl()}/icon.svg`;
}

function reportDeliveryFailure(kind: "verification" | "password reset" | "welcome", error: { name: string }) {
  // Never log the recipient, OTP, or template variables.
  console.error(`Resend could not send ${kind} email:`, error.name);
}

export async function sendPasswordResetCode(email: string, code: string) {
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
  const templateId = process.env.RESEND_PASSWORD_RESET_TEMPLATE_ID;
  const { error } = templateId
    ? await resend.emails.send({
      from,
      to: email,
      subject: "Your TalkSQL password reset code",
      template: { id: templateId, variables: { RESET_CODE: code, LOGO_URL: logoUrl() } },
    })
    : await resend.emails.send({
      from,
      to: email,
      subject: "Your TalkSQL password reset code",
      react: createElement(PasswordResetEmail, { code, logoUrl: logoUrl() }),
    });

  if (error) {
    reportDeliveryFailure("password reset", error);
    throw new Error("We could not deliver a password reset code. Please try again shortly.");
  }
}

/** Uses a published Resend Template created by `npm run email:templates`. */
export async function sendEmailVerificationCode(email: string, code: string) {
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
  const templateId = process.env.RESEND_VERIFICATION_TEMPLATE_ID;
  const { error } = templateId
    ? await resend.emails.send({
      from,
      to: email,
      subject: "Your TalkSQL verification code",
      template: { id: templateId, variables: { VERIFICATION_CODE: code, LOGO_URL: logoUrl() } },
    })
    : await resend.emails.send({
      from,
      to: email,
      subject: "Your TalkSQL verification code",
      react: createElement(VerificationEmail, { code, logoUrl: logoUrl() }),
    });

  if (error) {
    reportDeliveryFailure("verification", error);
    throw new Error("We could not deliver a verification code. Please try again shortly.");
  }
}

export async function sendWelcomeEmail({ email, name, userId }: { email: string; name: string; userId: string }) {
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
  const templateId = process.env.RESEND_WELCOME_TEMPLATE_ID;
  const message = templateId
    ? {
      from,
      to: email,
      subject: "Welcome to TalkSQL",
      template: { id: templateId, variables: { USER_NAME: name || "there", APP_URL: appUrl(), LOGO_URL: logoUrl() } },
    }
    : {
      from,
      to: email,
      subject: "Welcome to TalkSQL",
      react: createElement(WelcomeEmail, { appUrl: appUrl(), logoUrl: logoUrl(), name: name || "there" }),
    };
  const { error } = await resend.emails.send(
    message,
    { idempotencyKey: `talksql-welcome-${userId}` },
  );

  if (error) {
    reportDeliveryFailure("welcome", error);
    throw new Error("Welcome email delivery failed.");
  }
}
