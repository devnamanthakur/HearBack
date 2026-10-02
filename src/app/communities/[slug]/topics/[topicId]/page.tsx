import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/dbConnect";
import UserModel from "@/model/User";
import { listResponsesForUser } from "@/lib/communityQueries";
import { sameObjectId, getMemberNickname } from "@/helpers/communityUtils";
import TopicThread from "@/components/TopicThread";

export const metadata: Metadata = {
  title: "Topic | Hearback",
};

export default async function TopicPage({
  params,
}: {
  params: Promise<{ slug: string; topicId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const { slug, topicId } = await params;
  await dbConnect();
  const data = await listResponsesForUser(topicId, session.user.id);

  if (!data) {
    notFound();
  }

  if (data.role === "guest") {
    redirect(`/communities/${slug}`);
  }

  if (data.hidden) {
    redirect(`/communities/${slug}`);
  }

  const topic = data.topic;
  const authorName =
    topic.role === "admin"
      ? (await UserModel.findById(topic.authorId).select("username"))?.username
      : undefined;

  return (
    <TopicThread
      community={{
        slug,
        name: data.community.name,
        avatarColor: data.community.avatarColor,
        role: data.role,
      }}
      topic={{
        _id: topic._id.toString(),
        title: topic.title,
        body: topic.body,
        role: topic.role,
        authorName,
        authorNickname: topic.authorNickname,
        isClosed: topic.isClosed,
        isHidden: topic.isHidden ?? false,
        needsReview: topic.needsReview ?? false,
        isMine: sameObjectId(topic.authorId, session.user.id),
        doubtCount: topic.doubts.length,
        hasDoubts: topic.doubts.some((id) => sameObjectId(id, session.user.id)),
        notesUrl: topic.notesUrl ?? undefined,
        image: topic.image
          ? { mime: topic.image.mime, data: topic.image.data }
          : undefined,
        attachment: topic.attachment
          ? {
              name: topic.attachment.name,
              mime: topic.attachment.mime,
            }
          : undefined,
        createdAt: topic.createdAt,
      }}
      role={data.role}
      responses={data.responses}
      myNickname={getMemberNickname(data.community, session.user.id)}
    />
  );
}