import "server-only";

import { eq, sql } from "drizzle-orm";

import { accountActivity } from "@/db/schema";
import { getAppDb } from "@/lib/app-db";

/** These writes deliberately do not block auth if analytics is temporarily unavailable. */
export async function recordRegistration(userId: string, registeredAt: Date) {
  await getAppDb()
    .insert(accountActivity)
    .values({ userId, registeredAt })
    .onConflictDoNothing();
}

export async function recordActivation(userId: string) {
  const now = new Date();
  await getAppDb()
    .insert(accountActivity)
    .values({ userId, registeredAt: now, activatedAt: now })
    .onConflictDoUpdate({
      target: accountActivity.userId,
      set: { activatedAt: sql`coalesce(${accountActivity.activatedAt}, ${now})` },
    });
}

export async function recordLogin(userId: string, loggedInAt: Date) {
  await getAppDb()
    .insert(accountActivity)
    .values({
      userId,
      registeredAt: loggedInAt,
      firstLoginAt: loggedInAt,
      lastLoginAt: loggedInAt,
      loginCount: 1,
    })
    .onConflictDoUpdate({
      target: accountActivity.userId,
      set: {
        firstLoginAt: sql`coalesce(${accountActivity.firstLoginAt}, ${loggedInAt})`,
        lastLoginAt: loggedInAt,
        loginCount: sql`${accountActivity.loginCount} + 1`,
      },
    });
}

export async function shouldSendWelcomeEmail(userId: string) {
  const [activity] = await getAppDb()
    .select({ welcomeEmailSentAt: accountActivity.welcomeEmailSentAt })
    .from(accountActivity)
    .where(eq(accountActivity.userId, userId))
    .limit(1);
  return !activity?.welcomeEmailSentAt;
}

export async function recordWelcomeEmailSent(userId: string) {
  await getAppDb()
    .update(accountActivity)
    .set({ welcomeEmailSentAt: new Date() })
    .where(eq(accountActivity.userId, userId));
}

export async function getAccountActivationStats() {
  const [stats] = await getAppDb()
    .select({
      registeredUsers: sql<number>`count(*)`.mapWith(Number),
      activatedUsers: sql<number>`count(*) filter (where ${accountActivity.activatedAt} is not null)`.mapWith(Number),
      pendingActivationUsers: sql<number>`count(*) filter (where ${accountActivity.activatedAt} is null)`.mapWith(Number),
      neverLoggedInUsers: sql<number>`count(*) filter (where ${accountActivity.firstLoginAt} is null)`.mapWith(Number),
    })
    .from(accountActivity);

  return stats ?? { registeredUsers: 0, activatedUsers: 0, pendingActivationUsers: 0, neverLoggedInUsers: 0 };
}
