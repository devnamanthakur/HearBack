import CommunityModel from "@/model/Community";
import TopicModel from "@/model/Topic";
import ResponseModel from "@/model/Response";
import UserModel from "@/model/User";
import { getRole } from "@/helpers/communityUtils";

export interface CommunityCard {
  slug: string;
  name: string;
  avatarColor: string;
  role: "admin" | "member";
  memberCount: number;
  topicCount: number;
  lastActivity?: Date;
}

export interface ActivityItem {
  type: "post" | "comment";
  topicId: string;
  communitySlug: string;
  communityName: string;
  communityColor: string;
  title?: string;
  snippet: string;
  authorLabel: string;
  createdAt: Date;
}

export interface UnansweredTopic {
  topicId: string;
  title: string;
  communitySlug: string;
  communityName: string;
  commentCount: number;
  createdAt: Date;
}

export interface DashboardData {
  stats: {
    communities: number;
    posts: number;
    comments: number;
    unanswered: number;
  };
  mine: CommunityCard[];
  recentActivity: ActivityItem[];
  unanswered: UnansweredTopic[];
}

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const communities = await CommunityModel.find({});
  const myCommunities = communities.filter(
    (c) => getRole(c, userId) !== "guest",
  );
  const myCommunityIds = myCommunities.map((c) => c._id);
  const adminCommunityIdSet = new Set(
    myCommunities
      .filter((c) => getRole(c, userId) === "admin")
      .map((c) => c._id.toString()),
  );

  const topics = (
    await TopicModel.find({
      communityId: { $in: myCommunityIds },
    })
  ).filter(
    (t) => !t.isHidden || adminCommunityIdSet.has(t.communityId.toString()),
  );
  const topicIds = topics.map((t) => t._id);

  const responseDocs = (
    await ResponseModel.find({
      topicId: { $in: topicIds },
    })
  ).filter(
    (r) => !r.isHidden || adminCommunityIdSet.has(r.communityId.toString()),
  );

  const responseCount = responseDocs.length;

  const topicCountByCommunity = new Map<string, number>();
  topics.forEach((t) => {
    topicCountByCommunity.set(
      t.communityId.toString(),
      (topicCountByCommunity.get(t.communityId.toString()) ?? 0) + 1,
    );
  });

  const lastActivityByCommunity = new Map<string, Date>();
  const setLatest = (communityId: string, date: Date) => {
    const current = lastActivityByCommunity.get(communityId);
    if (!current || date > current) lastActivityByCommunity.set(communityId, date);
  };
  topics.forEach((t) => setLatest(t.communityId.toString(), t.createdAt));

  responseDocs.forEach((r) =>
    setLatest(r.communityId.toString(), r.createdAt),
  );

  const mine: CommunityCard[] = myCommunities.map((c) => ({
    slug: c.slug,
    name: c.name,
    avatarColor: c.avatarColor,
    role: getRole(c, userId) === "admin" ? "admin" : "member",
    memberCount: c.members.length + c.adminIds.length,
    topicCount: topicCountByCommunity.get(c._id.toString()) ?? 0,
    lastActivity: lastActivityByCommunity.get(c._id.toString()),
  }));

  const communityById = new Map(
    myCommunities.map((c) => [c._id.toString(), c]),
  );

  const adminAuthorIds = [
    ...new Set(
      topics
        .filter((t) => t.role === "admin")
        .map((t) => t.authorId.toString()),
    ),
  ];
  const usernameById = new Map<string, string>();
  if (adminAuthorIds.length > 0) {
    const admins = await UserModel.find({ _id: { $in: adminAuthorIds } }).select(
      "_id username",
    );
    admins.forEach((a) => usernameById.set(a._id.toString(), a.username));
  }

  const recentTopics = topics
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5);
  const recentResponses = responseDocs
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 8);

  const activity: ActivityItem[] = [
    ...recentTopics.map<ActivityItem>((t) => {
      const community = communityById.get(t.communityId.toString());
      return {
        type: "post",
        topicId: t._id.toString(),
        communitySlug: community?.slug ?? "",
        communityName: community?.name ?? "Community",
        communityColor: community?.avatarColor ?? "#6366f1",
        title: t.title,
        snippet: t.body,
        authorLabel:
          t.role === "admin"
            ? `Professor · ${usernameById.get(t.authorId.toString()) ?? "Faculty"}`
            : t.authorNickname ?? "Anonymous",
        createdAt: t.createdAt,
      };
    }),
    ...recentResponses.map<ActivityItem>((r) => {
      const topic = topics.find(
        (t) => t._id.toString() === r.topicId.toString(),
      );
      const community = communityById.get(r.communityId.toString());
      return {
        type: "comment",
        topicId: r.topicId.toString(),
        communitySlug: community?.slug ?? "",
        communityName: community?.name ?? "Community",
        communityColor: community?.avatarColor ?? "#6366f1",
        title: topic?.title ?? "Post",
        snippet: r.body,
        authorLabel:
          r.role === "admin"
            ? `Professor · ${usernameById.get(r.authorId.toString()) ?? "Faculty"}`
            : r.authorNickname ?? "Anonymous",
        createdAt: r.createdAt,
      };
    }),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Unanswered doubts: admin-authored topics whose most recent comment is from a member.
  const adminCommunityIds = myCommunities
    .filter((c) => getRole(c, userId) === "admin")
    .map((c) => c._id);
  const adminTopics = topics.filter(
    (t) =>
      t.role === "admin" &&
      adminCommunityIds.some((id) => id.toString() === t.communityId.toString()),
  );
  const adminTopicIds = adminTopics.map((t) => t._id);

  const lastResponseByTopic = new Map<
    string,
    { role: string; createdAt: Date }
  >();
  responseDocs
    .filter((r) => adminTopicIds.some((id) => id.toString() === r.topicId.toString()))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .forEach((r) => {
      const key = r.topicId.toString();
      if (!lastResponseByTopic.has(key)) {
        lastResponseByTopic.set(key, {
          role: r.role,
          createdAt: r.createdAt,
        });
      }
    });

  const commentCountByTopic = new Map<string, number>();
  responseDocs.forEach((r) => {
    const key = r.topicId.toString();
    commentCountByTopic.set(key, (commentCountByTopic.get(key) ?? 0) + 1);
  });

  const unanswered: UnansweredTopic[] = adminTopics
    .filter((t) => {
      const last = lastResponseByTopic.get(t._id.toString());
      return last?.role === "member";
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 8)
    .map((t) => {
      const community = communityById.get(t.communityId.toString());
      return {
        topicId: t._id.toString(),
        title: t.title,
        communitySlug: community?.slug ?? "",
        communityName: community?.name ?? "Community",
        commentCount: commentCountByTopic.get(t._id.toString()) ?? 0,
        createdAt: t.createdAt,
      };
    });

  return {
    stats: {
      communities: myCommunities.length,
      posts: topics.length,
      comments: responseCount,
      unanswered: unanswered.length,
    },
    mine,
    recentActivity: activity.slice(0, 10),
    unanswered,
  };
}