import { config } from "dotenv";
import { Resend } from "resend";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error("RESEND_API_KEY is required. Add it to .env.local, then run this command again.");
  process.exit(1);
}

const from = process.env.RESEND_FROM_EMAIL || "TalkSQL <onboarding@resend.dev>";
const resend = new Resend(apiKey);

const shell = (body) => `<!doctype html><html><body style="margin:0;background:#f7f7f5;color:#17211c;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dfe4df;border-radius:20px"><tr><td style="padding:32px"><img src="{{{LOGO_URL}}}" alt="TalkSQL" width="44" height="44" style="display:block;border:0" />${body}<p style="margin:28px 0 0;color:#66716b;font-size:12px;line-height:18px">TalkSQL · Your data, in conversation.</p></td></tr></table></td></tr></table></body></html>`;

const templates = [
  {
    alias: "talksql-verification",
    name: "TalkSQL — Verify email",
    subject: "Your TalkSQL verification code",
    text: "Your TalkSQL verification code is {{{VERIFICATION_CODE}}}. It expires in 5 minutes. If you did not create a TalkSQL account, you can ignore this email.",
    html: shell("<p style=\"margin:26px 0 0;color:#27704f;font-size:12px;font-weight:700;letter-spacing:1.5px\">ACTIVATE YOUR ACCOUNT</p><h1 style=\"margin:10px 0 0;font-size:28px;line-height:34px\">Verify your email</h1><p style=\"margin:16px 0;color:#526059;font-size:16px;line-height:24px\">Use this code to activate your TalkSQL account. It expires in five minutes.</p><p style=\"margin:24px 0 0;padding:18px 22px;background:#e6f1eb;border-radius:12px;color:#205b43;font-family:Consolas,monospace;font-size:30px;font-weight:700;letter-spacing:8px;text-align:center\">{{{VERIFICATION_CODE}}}</p><p style=\"margin:20px 0 0;color:#66716b;font-size:13px;line-height:20px\">If you did not create a TalkSQL account, you can ignore this email.</p>"),
    variables: [
      { key: "VERIFICATION_CODE", type: "string", fallbackValue: "000000" },
      { key: "LOGO_URL", type: "string", fallbackValue: "https://app.example.com/icon.svg" },
    ],
  },
  {
    alias: "talksql-password-reset",
    name: "TalkSQL — Reset password",
    subject: "Your TalkSQL password reset code",
    text: "Your TalkSQL password reset code is {{{RESET_CODE}}}. It expires in 5 minutes. If you did not request this, you can ignore this email.",
    html: shell("<p style=\"margin:26px 0 0;color:#27704f;font-size:12px;font-weight:700;letter-spacing:1.5px\">PASSWORD RESET</p><h1 style=\"margin:10px 0 0;font-size:28px;line-height:34px\">Choose a new password</h1><p style=\"margin:16px 0;color:#526059;font-size:16px;line-height:24px\">Enter this code in TalkSQL to reset your password. It expires in five minutes.</p><p style=\"margin:24px 0 0;padding:18px 22px;background:#e6f1eb;border-radius:12px;color:#205b43;font-family:Consolas,monospace;font-size:30px;font-weight:700;letter-spacing:8px;text-align:center\">{{{RESET_CODE}}}</p><p style=\"margin:20px 0 0;color:#66716b;font-size:13px;line-height:20px\">If you did not request a password reset, you can safely ignore this email.</p>"),
    variables: [
      { key: "RESET_CODE", type: "string", fallbackValue: "000000" },
      { key: "LOGO_URL", type: "string", fallbackValue: "https://app.example.com/icon.svg" },
    ],
  },
  {
    alias: "talksql-welcome",
    name: "TalkSQL — Welcome",
    subject: "Welcome to TalkSQL",
    text: "Welcome to TalkSQL, {{{USER_NAME}}}. Your workspace is ready. Start by connecting a database: {{{APP_URL}}}",
    html: shell("<p style=\"margin:26px 0 0;color:#27704f;font-size:12px;font-weight:700;letter-spacing:1.5px\">WELCOME TO TALKSQL</p><h1 style=\"margin:10px 0 0;font-size:28px;line-height:34px\">Your workspace is ready, {{{USER_NAME}}}.</h1><p style=\"margin:16px 0;color:#526059;font-size:16px;line-height:24px\">Connect your first database, inspect the schema, and turn trusted answers into a live dashboard.</p><p style=\"margin:26px 0 0\"><a href=\"{{{APP_URL}}}\" style=\"display:inline-block;padding:12px 18px;background:#205b43;border-radius:10px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none\">Open TalkSQL →</a></p>"),
    variables: [
      { key: "USER_NAME", type: "string", fallbackValue: "there" },
      { key: "APP_URL", type: "string", fallbackValue: "https://app.example.com" },
      { key: "LOGO_URL", type: "string", fallbackValue: "https://app.example.com/icon.svg" },
    ],
  },
];

async function upsertTemplate(template) {
  const existing = await resend.templates.get(template.alias);
  if (existing.error && existing.error.name !== "not_found") {
    if (existing.error.name === "restricted_api_key") {
      throw new Error("Template publishing requires a Full Access Resend API key. Your send-only key can still send the bundled React Email templates.");
    }
    throw new Error(existing.error.message);
  }

  const payload = { ...template, from };
  if (existing.data) {
    const updated = await resend.templates.update(template.alias, payload);
    if (updated.error) throw new Error(updated.error.message);
    const published = await resend.templates.publish(template.alias);
    if (published.error) throw new Error(published.error.message);
    return published.data.id;
  }

  const created = await resend.templates.create(payload);
  if (created.error) throw new Error(created.error.message);
  const published = await resend.templates.publish(created.data.id);
  if (published.error) throw new Error(published.error.message);
  return published.data.id;
}

for (const template of templates) {
  const id = await upsertTemplate(template);
  console.log(`${template.alias}: ${id}`);
}

console.log("Published TalkSQL verification, password reset, and welcome templates in Resend.");
