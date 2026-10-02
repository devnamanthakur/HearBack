import mongoose from "mongoose";
import CommunityModel from "@/model/Community";
import TopicModel from "@/model/Topic";
import ResponseModel from "@/model/Response";
import UserModel from "@/model/User";
import {
  getRole,
  isAdmin,
  getMemberNickname,
  sameObjectId,
} from "@/helpers/communityUtils";
import { domainMatchesPatterns } from "@/helpers/emailDomains";

export interface CommunitySummary {
  slug: string;
  name: string;
  description: string;
  avatarColor: string;
  inviteCode?: string;
  inviteCodeExpiresAt?: Date;
  role: "admin" | "member" | "guest";
  memberCount: number;
  adminCount: number;
  nickname?: string;
  createdAt: Date;
  type: "normal" | "educational";
  joinPolicy: "open" | "approval";
  aiModeration: boolean;
  requiredEmailDomains: string[];
  isBanned: boolean;
  /** Whether this viewer can actually join (school email matches, or it's an open community). */
  viewerCanJoin: boolean;
}

export interface ImageInfo {
  mime: string;
  data: string;
}

export interface AttachmentInfo {
  name: string;
  mime: string;
  size: number;
}

export interface TopicSummary {
  _id: string;
  title: string;
  body: string;
  role: "admin" | "member";
  authorName?: string;
  authorNickname?: string;
  isClosed: boolean;
  isHidden: boolean;
  needsReview: boolean;
  responseCount: number;
  doubtCount: number;
  hasDoubts: boolean;
  isMine: boolean;
  notesUrl?: string;
  image?: ImageInfo;
  attachment?: AttachmentInfo;
  createdAt: Date;
}

export interface ResponseSummary {
  _id: string;
  body: string;
  role: "admin" | "member";
  authorName?: string;
  authorNickname?: string;
  replyToId: string | null;
  createdAt: Date;
  isMine: boolean;
  isHidden: boolean;
  needsReview: boolean;
  image?: ImageInfo;
  doubtCount: number;
  hasDoubts: boolean;
}

export function serializeCommunity(
  community: {
    slug: string;
    name: string;
    description: string;
    avatarColor: string;
    inviteCode: string;
    inviteCodeExpiresAt?: Date;
    type: "normal" | "educational";
    joinPolicy: "open" | "approval";
    aiModeration: boolean;
    requiredEmailDomains: string[];
    adminIds: mongoose.Types.ObjectId[];
    members: { userId: mongoose.Types.ObjectId; nickname: string }[];
    bannedUserIds: mongoose.Types.ObjectId[];
    createdAt: Date;
  },
  role: "admin" | "member" | "guest",
  includeInvite: boolean,
  nickname?: string,
  viewerId?: string,
  viewerSchoolDomain?: string,
): CommunitySummary {
  const isEducational = (community.type ?? "normal") === "educational";
  const viewerCanJoin =
    role !== "guest" || !isEducational
      ? true
      : Boolean(
          viewerSchoolDomain &&
            domainMatchesPatterns(
              viewerSchoolDomain,
              community.requiredEmailDomains ?? [],
            ),
        );

  return {
    slug: community.slug,
    name: community.name,
    description: community.description,
    avatarColor: community.avatarColor,
    inviteCode: includeInvite ? community.inviteCode : undefined,
    inviteCodeExpiresAt: includeInvite
      ? community.inviteCodeExpiresAt
      : undefined,
    role,
    memberCount: community.members.length + community.adminIds.length,
    adminCount: community.adminIds.length,
    nickname,
    createdAt: community.createdAt,
    type: community.type ?? "normal",
    joinPolicy: community.joinPolicy ?? "open",
    aiModeration: community.aiModeration ?? true,
    requiredEmailDomains: community.requiredEmailDomains ?? [],
    isBanned: viewerId
      ? community.bannedUserIds?.some((id) => sameObjectId(id, viewerId)) ??
        false
      : false,
    viewerCanJoin,
  };
}

async function schoolDomainForUser(userId: string): Promise<string | null> {
  const user = await UserModel.findById(userId).select("schoolDomain");
  return user?.schoolDomain ?? null;
}

function isBanned(
  community: { bannedUserIds: mongoose.Types.ObjectId[] },
  userId: string,
) {
  return community.bannedUserIds?.some((id) => sameObjectId(id, userId)) ?? false;
}

export async function listCommunitiesForUser(userId: string) {
  const schoolDomain = await schoolDomainForUser(userId);
  const communities = await CommunityModel.find({}).sort({ createdAt: -1 });

  // Every non-banned community is discoverable, including educational ones
  // from other colleges. `viewerCanJoin` tells the UI which ones this viewer's
  // verified school email actually opens, so other colleges can be shown as
  // examples without being joinable.
  const visible = communities.filter((community) => !isBanned(community, userId));

  const mine = visible.filter((c) => getRole(c, userId) !== "guest");
  const discoverable = visible.filter((c) => getRole(c, userId) === "guest");
  const toSummary = (c: (typeof communities)[number]) =>
    serializeCommunity(
      c,
      getRole(c, userId),
      isAdmin(c, userId),
      getMemberNickname(c, userId),
      userId,
      schoolDomain ?? undefined,
    );

  return {
    mine: mine.map(toSummary),
    discover: discoverable.map(toSummary),
    schoolDomain,
  };
}

export async function findCommunitySummary(slug: string, userId: string) {
  const community = await CommunityModel.findOne({ slug });
  if (!community) return null;
  const role = getRole(community, userId);
  return {
    community: serializeCommunity(
      community,
      role,
      isAdmin(community, userId),
      getMemberNickname(community, userId),
      userId,
    ),
    role,
  };
}

async function usernamesForIds(ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map<string, string>();
  const users = await UserModel.find({ _id: { $in: unique } }).select(
    "_id username",
  );
  return new Map(users.map((u) => [u._id.toString(), u.username]));
}

export async function listTopicsForUser(communityId: string, userId: string) {
  const community = await CommunityModel.findById(communityId);
  if (!community) return { role: "guest" as const, topics: [] as TopicSummary[] };
  const role = getRole(community, userId);
  if (role === "guest") return { role, topics: [] as TopicSummary[] };

  const filter: Record<string, unknown> = { communityId };
  if (role !== "admin") {
    // Non-admins see everything that is not hidden, plus their own hidden
    // topics so an author can still view (but not interact with) them.
    filter.$or = [{ isHidden: { $ne: true } }, { authorId: userId }];
  }

  const topics = await TopicModel.find(filter).sort({ createdAt: -1 });
  const usernameById = await usernamesForIds(
    topics.filter((t) => t.role === "admin").map((t) => t.authorId.toString()),
  );

  // Admins see the true comment count; everyone else must not be tipped off
  // by counts that include hidden comments (except their own, which they can
  // still see in the thread).
  const countMatch: Record<string, unknown> = {
    topicId: { $in: topics.map((t) => t._id) },
  };
  if (role !== "admin") {
    countMatch.$or = [{ isHidden: { $ne: true } }, { authorId: userId }];
  }

  const counts = await ResponseModel.aggregate([
    { $match: countMatch },
    { $group: { _id: "$topicId", count: { $sum: 1 } } },
  ]);
  const countByTopic = new Map(counts.map((c) => [c._id.toString(), c.count]));

  return {
    role,
    topics: topics.map<TopicSummary>((topic) => ({
      _id: topic._id.toString(),
      title: topic.title,
      body: topic.body,
      role: topic.role,
      authorName:
        topic.role === "admin"
          ? usernameById.get(topic.authorId.toString()) ?? "Faculty"
          : undefined,
      authorNickname: topic.authorNickname,
      isClosed: topic.isClosed,
      isHidden: topic.isHidden ?? false,
      needsReview: topic.needsReview ?? false,
      responseCount: countByTopic.get(topic._id.toString()) ?? 0,
      doubtCount: topic.doubts.length,
      hasDoubts: topic.doubts.some((id) => sameObjectId(id, userId)),
      isMine: sameObjectId(topic.authorId, userId),
      notesUrl: topic.notesUrl ?? undefined,
      image: topic.image
        ? { mime: topic.image.mime, data: topic.image.data }
        : undefined,
      attachment: topic.attachment
        ? {
            name: topic.attachment.name,
            mime: topic.attachment.mime,
            size: Math.round(
              (topic.attachment.data.length * 3) / 4,
            ),
          }
        : undefined,
      createdAt: topic.createdAt,
    })),
  };
}

export async function listResponsesForUser(topicId: string, userId: string) {
  const topic = await TopicModel.findById(topicId);
  if (!topic) return null;

  const community = await CommunityModel.findById(topic.communityId);
  if (!community) return null;

  const role = getRole(community, userId);
  if (role === "guest") {
    return {
      community,
      topic,
      role: "guest" as const,
      hidden: false,
      isAuthor: false,
      responses: [] as ResponseSummary[],
      isClosed: topic.isClosed,
    };
  }

  const isAuthor = sameObjectId(topic.authorId, userId);
  // The author of a hidden topic may still view it (and their own hidden
  // comments) but hidden content is non-interactive for non-admins.
  const hidden = (topic.isHidden ?? false) && role !== "admin" && !isAuthor;

  const filter: Record<string, unknown> = { topicId };
  if (role !== "admin") {
    filter.$or = [{ isHidden: { $ne: true } }, { authorId: userId }];
  }

  const responses = await ResponseModel.find(filter).sort({ createdAt: 1 });
  const usernameById = await usernamesForIds(
    responses
      .filter((r) => r.role === "admin")
      .map((r) => r.authorId.toString()),
  );

  return {
    community,
    topic,
    role,
    hidden,
    isAuthor,
    isClosed: topic.isClosed,
    responses: responses.map<ResponseSummary>((response) => ({
      _id: response._id.toString(),
      body: response.body,
      role: response.role,
      authorName:
        response.role === "admin"
          ? usernameById.get(response.authorId.toString()) ?? "Faculty"
          : undefined,
      authorNickname: response.authorNickname,
      replyToId: response.replyToId?.toString() ?? null,
      createdAt: response.createdAt,
      isMine: sameObjectId(response.authorId, userId),
      isHidden: response.isHidden ?? false,
      needsReview: response.needsReview ?? false,
      image: response.image
        ? { mime: response.image.mime, data: response.image.data }
        : undefined,
      doubtCount: response.doubts.length,
      hasDoubts: response.doubts.some((id) => sameObjectId(id, userId)),
    })),
  };
}
