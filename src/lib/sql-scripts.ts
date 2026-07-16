import { z } from "zod";

export const scriptNameSchema = z.string()
  .trim()
  .min(1, "Give the script a name.")
  .max(120, "Script names can be at most 120 characters.")
  .refine((name) => !/[\\/\0]/.test(name), "Script names cannot contain slashes.");

export const scriptContentSchema = z.string().max(250_000, "SQL scripts can be at most 250 KB.");

export function normalizeScriptName(name: string) {
  const trimmed = name.trim();
  return trimmed.toLowerCase().endsWith(".sql") ? trimmed : `${trimmed}.sql`;
}

export function isUniqueViolation(error: unknown) {
  return (error as { code?: string }).code === "23505";
}
