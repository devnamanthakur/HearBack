import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/dbConnect";
import UserModel from "@/model/User";
import { getDashboardData } from "@/lib/dashboardQueries";
import Dashboard, { type MessageItem } from "@/components/Dashboard";

export const metadata: Metadata = {
  title: "Dashboard | Hearback",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  await dbConnect();
  const user = await UserModel.findById(session.user.id).select(
    "username isAcceptingMessage messages schoolEmail schoolDomain",
  );

  if (!user) {
    redirect("/sign-in");
  }

  const headersList = await headers();
  const host =
    headersList.get("x-forwarded-host") ?? headersList.get("host");
  const proto = headersList.get("x-forwarded-proto") ?? "http";

  const messages: MessageItem[] = user.messages
    .map((message) => ({
      _id: message._id.toString(),
      content: message.content,
      createdAt: message.createdAt.toString(),
    }))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  const dashboard = await getDashboardData(session.user.id);

  return (
    <Dashboard
      username={user.username}
      profileLink={`${proto}://${host}/u/${user.username}`}
      isAcceptingMessage={user.isAcceptingMessage}
      messages={messages}
      dashboard={dashboard}
      schoolEmail={user.schoolEmail ?? undefined}
      schoolDomain={user.schoolDomain ?? undefined}
    />
  );
}