"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import type { DashboardData } from "@/lib/dashboardQueries";
import SchoolEmailCard from "@/components/SchoolEmailCard";

export interface MessageItem {
  _id: string;
  content: string;
  createdAt: string;
}

interface DashboardProps {
  username: string;
  profileLink: string;
  isAcceptingMessage: boolean;
  messages: MessageItem[];
  dashboard: DashboardData;
  schoolEmail?: string;
  schoolDomain?: string;
}

function timeAgo(date?: Date | string): string {
  if (!date) return "No activity yet";
  const then = new Date(date).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function Dashboard({
  username,
  profileLink,
  isAcceptingMessage: initialAccepting,
  messages: initialMessages,
  dashboard,
  schoolEmail,
  schoolDomain,
}: DashboardProps) {
  const [messages, setMessages] = useState<MessageItem[]>(initialMessages);
  const [isAcceptingMessage, setIsAcceptingMessage] = useState(
    initialAccepting,
  );
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  const showToast = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 2000);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(profileLink);
      showToast("Profile link copied to clipboard");
    } catch {
      showToast("Could not copy link. Copy manually: " + profileLink);
    }
  };

  const toggleAcceptance = async () => {
    setBusy(true);
    try {
      const next = !isAcceptingMessage;
      const res = await fetch("/api/accept-message", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptMessage: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.message ?? "Failed to update status");
        return;
      }
      setIsAcceptingMessage(next);
      showToast(next ? "Now accepting messages" : "Not accepting messages");
    } catch {
      showToast("Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const deleteMessage = async (messageId: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.message ?? "Failed to delete message");
        return;
      }
      setMessages((prev) => prev.filter((m) => m._id !== messageId));
      showToast("Message deleted");
    } catch {
      showToast("Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const stats = dashboard.stats;

  return (
    <div className="min-h-screen bg-zinc-100 px-4 py-10 dark:bg-zinc-900">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Welcome, {username}
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Your classroom communities and anonymous inbox
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/communities"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:opacity-90"
            >
              Communities
            </Link>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              Sign out
            </button>
          </div>
        </div>

        <SchoolEmailCard
          schoolEmail={schoolEmail}
          schoolDomain={schoolDomain}
        />

        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Communities", value: stats.communities },
            { label: "Posts", value: stats.posts },
            { label: "Comments", value: stats.comments },
            { label: "Unanswered doubts", value: stats.unanswered },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-zinc-200 bg-white p-5 text-center shadow-sm dark:border-white/10 dark:bg-zinc-900"
            >
              <p className="text-3xl font-black text-zinc-900 dark:text-white">
                {s.value}
              </p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
                {s.label}
              </p>
            </div>
          ))}
        </div>

        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
              Your communities
            </h2>
            <Link
              href="/communities"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
            >
              Manage →
            </Link>
          </div>
          {dashboard.mine.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/50 p-10 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                You haven&apos;t joined any communities yet.{" "}
                <Link
                  href="/communities"
                  className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                >
                  Create or join one
                </Link>{" "}
                to start classroom discussions.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {dashboard.mine.map((c) => (
                <Link
                  key={c.slug}
                  href={`/communities/${c.slug}`}
                  className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-zinc-400 hover:shadow-md dark:border-white/10 dark:bg-zinc-900 dark:hover:border-zinc-500"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-black text-white"
                      style={{ backgroundColor: c.avatarColor }}
                    >
                      {c.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
                        {c.name}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {c.role === "admin" ? "Admin" : "Member"} ·{" "}
                        {c.memberCount} members · {c.topicCount} posts
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-zinc-400">
                    {timeAgo(c.lastActivity)}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white">
              Recent activity
            </h2>
            {dashboard.recentActivity.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No activity yet. Post in a community or reply to a doubt!
              </p>
            ) : (
              <ul className="space-y-3">
                {dashboard.recentActivity.map((item, i) => (
                  <li key={i}>
                    <Link
                      href={`/communities/${item.communitySlug}/topics/${item.topicId}`}
                      className="flex items-start gap-3 rounded-xl p-2 transition hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      <span
                        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black text-white"
                        style={{ backgroundColor: item.communityColor }}
                      >
                        {item.communityName.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-zinc-900 dark:text-white">
                          {item.type === "post" ? item.title : item.title}
                        </span>
                        <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                          {item.authorLabel} · {item.snippet}
                        </span>
                        <span className="text-[11px] text-zinc-400">
                          {item.communityName} · {timeAgo(item.createdAt)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white">
              Unanswered doubts
            </h2>
            {dashboard.unanswered.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Nothing pending. Every recent student comment has a professor
                reply.
              </p>
            ) : (
              <ul className="space-y-3">
                {dashboard.unanswered.map((t) => (
                  <li key={t.topicId}>
                    <Link
                      href={`/communities/${t.communitySlug}/topics/${t.topicId}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50 p-3 transition hover:border-amber-300 dark:border-amber-900/40 dark:bg-amber-950/30"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-zinc-900 dark:text-white">
                          {t.title}
                        </span>
                        <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                          {t.communityName} · {t.commentCount} comments ·{" "}
                          {timeAgo(t.createdAt)}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-500">
                        Reply
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-zinc-900">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white">
            Your anonymous inbox
          </h2>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Share your profile link
              </p>
              <p className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">
                {profileLink}
              </p>
            </div>
            <button
              type="button"
              onClick={copyLink}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:opacity-90"
            >
              Copy link
            </button>
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-zinc-100 pt-6 dark:border-zinc-800">
            <div>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Accepting messages
              </p>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Turn off to stop receiving new messages
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isAcceptingMessage}
              disabled={busy}
              onClick={toggleAcceptance}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                isAcceptingMessage
                  ? "bg-indigo-600"
                  : "bg-zinc-300 dark:bg-zinc-700"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                  isAcceptingMessage ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="mt-6">
            <p className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Messages{" "}
              <span className="text-sm font-normal text-zinc-400">
                ({messages.length})
              </span>
            </p>
            {messages.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-300 bg-white/50 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400">
                No messages yet. Share your profile link to start receiving
                anonymous feedback.
              </p>
            ) : (
              <ul className="space-y-3">
                {messages.map((msg) => (
                  <li
                    key={msg._id}
                    className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900"
                  >
                    <p className="whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-100">
                      {msg.content}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-zinc-400">
                        {new Date(msg.createdAt).toLocaleString()}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => deleteMessage(msg._id)}
                        className="text-xs font-medium text-red-500 transition hover:text-red-400 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-xl dark:bg-white dark:text-zinc-900">
          {toast}
        </div>
      )}
    </div>
  );
}