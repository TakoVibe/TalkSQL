import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function getEncryptionKey() {
  const encoded = process.env.CONNECTION_ENCRYPTION_KEY;
  if (!encoded) throw new Error("CONNECTION_ENCRYPTION_KEY is not configured.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("CONNECTION_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  return key;
}

export function encryptConnectionCredentials(credentials: { username: string; password: string }) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credentials), "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decryptConnectionCredentials(encrypted: string): { username: string; password: string } {
  const [encodedIv, encodedTag, encodedCiphertext] = encrypted.split(".");
  if (!encodedIv || !encodedTag || !encodedCiphertext) throw new Error("Stored connection credentials are invalid.");
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(encodedIv, "base64"));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(encodedCiphertext, "base64")), decipher.final()]).toString("utf8");
  const credentials = JSON.parse(plaintext) as { username?: unknown; password?: unknown };
  if (typeof credentials.username !== "string" || typeof credentials.password !== "string") throw new Error("Stored connection credentials are invalid.");
  return { username: credentials.username, password: credentials.password };
}
