import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/dbConnect";
import CommunityModel from "@/model/Community";
import UserModel from "@/model/User";
import { getRole, getMemberNickname } from "@/helpers/communityUtils";
import {
  listTopicsForUser,
  serializeCommunity,
  type TopicSummary,
} from "@/lib/communityQueries";
import CommunityPage from "@/components/CommunityPage";

export const metadata: Metadata = {
  title: "Community | Hearback",
};

export default async function CommunityHome({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const { slug } = await params;
  await dbConnect();
  const community = await CommunityModel.findOne({ slug });
  if (!community) {
    notFound();
  }

  const role = getRole(community, session.user.id);
  const viewer = await UserModel.findById(session.user.id).select(
    "schoolDomain",
  );
  let topics: TopicSummary[] = [];
  if (role !== "guest") {
    const data = await listTopicsForUser(
      community._id.toString(),
      session.user.id,
    );
    topics = data.topics;
  }

  return (
    <CommunityPage
      community={serializeCommunity(
        community,
        role,
        role === "admin",
        getMemberNickname(community, session.user.id),
        session.user.id,
        viewer?.schoolDomain ?? undefined,
      )}
      topics={topics}
    />
  );
}