import { betterAuth } from "better-auth";
import { emailOTP, organization } from "better-auth/plugins";
import { config } from "dotenv";
import { Pool } from "pg";

import { recordActivation, recordLogin, recordRegistration, recordWelcomeEmailSent, shouldSendWelcomeEmail } from "@/lib/account-activity";
import { sendEmailVerificationCode, sendWelcomeEmail } from "@/lib/transactional-email";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

function createAuth() {
  const databaseUrl = process.env.DATABASE_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!databaseUrl || !secret || secret.length < 32) {
    throw new Error("DATABASE_URL and a 32+ character BETTER_AUTH_SECRET are required.");
  }

  return betterAuth({
    database: new Pool({ connectionString: databaseUrl }),
    secret,
    baseURL: process.env.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      sendOnSignUp: false,
      sendOnSignIn: true,
      afterEmailVerification: async (user) => {
        await recordActivation(user.id).catch((error) => console.error("Could not record account activation:", error));
        const shouldSendWelcome = await shouldSendWelcomeEmail(user.id).catch((error) => {
          console.error("Could not check welcome email status:", error);
          return false;
        });
        if (shouldSendWelcome) {
          await sendWelcomeEmail({ email: user.email, name: user.name, userId: user.id })
            .then(() => recordWelcomeEmailSent(user.id))
            .catch((error) => console.error("Could not send welcome email:", error));
        }
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await recordRegistration(user.id, user.createdAt).catch((error) => console.error("Could not record registration:", error));
          },
        },
      },
      session: {
        create: {
          after: async (session) => {
            await recordLogin(session.userId, session.createdAt).catch((error) => console.error("Could not record login:", error));
          },
        },
      },
    },
    plugins: [
      organization(),
      emailOTP({
        overrideDefaultEmailVerification: true,
        otpLength: 6,
        expiresIn: 5 * 60,
        allowedAttempts: 5,
        storeOTP: "hashed",
        rateLimit: { window: 60, max: 3 },
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type !== "email-verification") return;
          await sendEmailVerificationCode(email, otp);
        },
      }),
    ],
  });
}

/** Better Auth CLI discovers this named export to create the auth schema. */
export const auth = createAuth();

export function getAuth() {
  return auth;
}
