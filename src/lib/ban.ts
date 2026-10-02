import { createHmac } from "node:crypto";
import { normalizeEmail } from "@/helpers/emailDomains";

/**
 * One-way *keyed* hash of a verified school email, used to block a banned
 * student from rejoining with a fresh account. A plain SHA-256 of an email is
 * brute-forceable (emails are low-entropy), so we use HMAC with a server
 * secret: without the secret the stored hash cannot be reversed by enumeration.
 *
 * The raw email is never stored on the community, so an admin cannot recover an
 * identity from the ban list. NOTE: because the key is environment-specific,
 * hashes are only comparable within one deployment — changing the secret
 * invalidates existing school-email blocks.
 */
export function hashSchoolEmail(email: string): string {
  const secret =
    process.env.BAN_HASH_SECRET ?? process.env.AUTH_SECRET ?? "";
  return createHmac("sha256", secret).update(normalizeEmail(email)).digest("hex");
}
