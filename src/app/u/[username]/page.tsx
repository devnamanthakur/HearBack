import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import dbConnect from "@/lib/dbConnect";
import UserModel from "@/model/User";
import SendMessageForm from "@/components/SendMessageForm";

export const metadata: Metadata = {
  title: "Send a message | Hearback",
};

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  await dbConnect();

  const user = await UserModel.findOne({ username }).select(
    "username isAcceptingMessage",
  );

  if (!user) {
    notFound();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 py-10 dark:bg-zinc-900">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600 text-2xl font-black text-white shadow-lg">
            {username.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            {username}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Share something honest. Your identity stays anonymous.
          </p>
        </div>

        {user.isAcceptingMessage ? (
          <SendMessageForm username={username} />
        ) : (
          <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-xl dark:border-white/10 dark:bg-zinc-900">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
              <svg
                className="h-6 w-6 text-zinc-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
              Not accepting messages
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {username} has temporarily turned off their inbox.
            </p>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
          <Link
            href="/"
            className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            Hearback
          </Link>{" "}
          — messages are delivered fully anonymously.
        </p>
      </div>
    </div>
  );
}