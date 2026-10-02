import mongoose from "mongoose";
import { randomInt } from "node:crypto";
import { generateNickname } from "@/lib/nicknames";

export { generateNickname };

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInviteCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    // randomInt is cryptographically secure; an invite code is an access token.
    code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  }
  return code;
}

export function sameObjectId(a: mongoose.Types.ObjectId | string, b: string) {
  return a.toString() === b.toString();
}

export function isAdmin(community: {
  adminIds: (mongoose.Types.ObjectId | string)[];
}, userId: string) {
  return community.adminIds.some((id) => sameObjectId(id, userId));
}

export function getMember(
  community: {
    members: { userId: mongoose.Types.ObjectId; nickname: string }[];
  },
  userId: string,
) {
  return community.members.find((m) => sameObjectId(m.userId, userId));
}

export function isMember(community: {
  members: { userId: mongoose.Types.ObjectId }[];
}, userId: string) {
  return community.members.some((m) => sameObjectId(m.userId, userId));
}

export function getMemberNickname(community: {
  members: { userId: mongoose.Types.ObjectId; nickname: string }[];
}, userId: string): string | undefined {
  return getMember(community, userId)?.nickname;
}

export function getRole(community: {
  adminIds: (mongoose.Types.ObjectId | string)[];
  members: { userId: mongoose.Types.ObjectId }[];
}, userId: string): "admin" | "member" | "guest" {
  if (isAdmin(community, userId)) return "admin";
  if (isMember(community, userId)) return "member";
  return "guest";
}