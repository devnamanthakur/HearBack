import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/dbConnect";
import { listCommunitiesForUser } from "@/lib/communityQueries";
import CommunityBrowser from "@/components/CommunityBrowser";

export const metadata: Metadata = {
  title: "Communities | Hearback",
};

export default async function CommunitiesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  await dbConnect();
  const { mine, discover, schoolDomain } = await listCommunitiesForUser(
    session.user.id,
  );

  return (
    <CommunityBrowser
      mine={mine}
      discover={discover}
      schoolDomain={schoolDomain}
    />
  );
}