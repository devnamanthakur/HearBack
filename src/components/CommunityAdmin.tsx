"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CommunitySummary } from "@/lib/communityQueries";

interface MemberItem {
  userId: string;
  nickname: string;
  joinedAt: string;
  strikes: number;
  mutedUntil?: string;
}

interface ReportItem {
  _id: string;
  targetType: "topic" | "response";
  targetId: string;
  reason: string;
  note?: string;
  status: "pending" | "resolved" | "dismissed";
  createdAt: string;
  actionTaken?: string;
  reporterNickname: string;
  authorNickname: string;
  targetTitle?: string;
  targetBody: string;
  isHidden: boolean;
}

interface JoinRequestItem {
  _id: string;
  nickname: string;
  createdAt: string;
}

interface AppealItem {
  _id: string;
  userId: string;
  nickname: string;
  message: string;
  status: "pending" | "approved" | "denied";
  createdAt: string;
}

interface ReviewItem {
  _id: string;
  targetType: "topic" | "response";
  title?: string;
  body: string;
  authorNickname: string;
  authorRole: "admin" | "member";
  isHidden: boolean;
  createdAt: string;
}

interface LogItem {
  _id: string;
  action: string;
  detail?: string;
  targetType: string;
  targetId?: string;
  createdAt: string;
  actorName: string;
}

const TABS = [
  "members",
  "review",
  "reports",
  "approvals",
  "settings",
  "log",
] as const;
type Tab = (typeof TABS)[number];

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function nearestTtlHours(expiresAt?: Date | string): number | null {
  if (!expiresAt) return null;
  const remainingHours =
    (new Date(expiresAt).getTime() - Date.now()) / (60 * 60 * 1000);
  if (remainingHours <= 0) return 24 * 7;
  return [24, 168, 720].reduce((best, option) =>
    Math.abs(option - remainingHours) < Math.abs(best - remainingHours)
      ? option
      : best,
  );
}

export default function CommunityAdmin({
  slug,
  community,
}: {
  slug: string;
  community: CommunitySummary;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("members");
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [banned, setBanned] = useState<string[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [requests, setRequests] = useState<JoinRequestItem[]>([]);
  const [appeals, setAppeals] = useState<AppealItem[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [inviteCode, setInviteCode] = useState(community.inviteCode ?? "");
  const [inviteExpiry, setInviteExpiry] = useState<
    string | null
  >(
    community.inviteCodeExpiresAt
      ? new Date(community.inviteCodeExpiresAt).toISOString()
      : null,
  );
  const [ttlHours, setTtlHours] = useState<number | null>(() =>
    nearestTtlHours(community.inviteCodeExpiresAt),
  );
  const [domainsInput, setDomainsInput] = useState(
    community.requiredEmailDomains.join(", "),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestIdRef = useRef(0);

  const flash = (text: string, isError = false) => {
    if (isError) {
      setError(text);
      setNotice("");
    } else {
      setNotice(text);
      setError("");
    }
    window.setTimeout(() => {
      setError("");
      setNotice("");
    }, 3000);
  };

  const load = useCallback(
    async (target: Tab) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setBusy(true);
      try {
        // Fetch first, then apply state — and only if this is still the most
        // recent request, so a slow tab can never overwrite a newer one.
        let apply: (() => void) | null = null;

        if (target === "members") {
          const res = await fetch(`/api/communities/${slug}/members`);
          const data = await res.json();
          if (!res.ok || !data.success) throw new Error(data.message);
          apply = () => {
            setMembers(data.members as MemberItem[]);
            setBanned(data.banned as string[]);
          };
        } else if (target === "review") {
          const res = await fetch(`/api/communities/${slug}/needs-review`);
          const data = await res.json();
          if (!res.ok || !data.success) throw new Error(data.message);
          apply = () => setReviews(data.items as ReviewItem[]);
        } else if (target === "reports") {
          const res = await fetch(
            `/api/communities/${slug}/reports?status=pending`,
          );
          const data = await res.json();
          if (!res.ok || !data.success) throw new Error(data.message);
          apply = () => setReports(data.reports as ReportItem[]);
        } else if (target === "approvals") {
          const [reqRes, appealRes] = await Promise.all([
            fetch(`/api/communities/${slug}/join-requests`),
            fetch(`/api/communities/${slug}/appeals`),
          ]);
          const reqData = await reqRes.json();
          if (!reqRes.ok || !reqData.success) throw new Error(reqData.message);
          const appealData = await appealRes.json();
          if (!appealRes.ok || !appealData.success) {
            throw new Error(appealData.message);
          }
          apply = () => {
            setRequests(reqData.requests as JoinRequestItem[]);
            setAppeals(appealData.appeals as AppealItem[]);
          };
        } else if (target === "log") {
          const res = await fetch(`/api/communities/${slug}/moderation-log`);
          const data = await res.json();
          if (!res.ok || !data.success) throw new Error(data.message);
          apply = () => setLogs(data.entries as LogItem[]);
        }

        if (requestId === requestIdRef.current && apply) apply();
      } catch (err) {
        if (requestId === requestIdRef.current) {
          flash(err instanceof Error ? err.message : "Failed to load", true);
        }
      } finally {
        if (requestId === requestIdRef.current) setBusy(false);
      }
    },
    [slug],
  );

  useEffect(() => {
    // Defer to a microtask so the async load (which flips `busy`) never sets
    // state synchronously during the effect, and ignore stale runs.
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void load(tab);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, load]);

  const memberAction = async (
    userId: string,
    action: "mute" | "unmute" | "remove" | "ban" | "unban",
  ) => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/communities/${slug}/members/${userId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);
      flash(data.message);
      await load("members");
      router.refresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Action failed", true);
    } finally {
      setBusy(false);
    }
  };

  const reportAction = async (
    reportId: string,
    action: "dismiss" | "resolve",
  ) => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/communities/${slug}/reports/${reportId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);
      flash(data.message);
      await load("reports");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Action failed", true);
    } finally {
      setBusy(false);
    }
  };

  const hideTarget = async (report: ReportItem) => {
    setBusy(true);
    try {
      const url =
        report.targetType === "topic"
          ? `/api/topics/${report.targetId}`
          : `/api/responses/${report.targetId}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isHidden: !report.isHidden }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);
      flash(data.message);
      await load("reports");
      router.refresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Action failed", true);
    } finally {
      setBusy(false);
    }
  };

  const banAuthor = async (report: ReportItem) => {
    if (
      !window.confirm(
        "Ban the author anonymously and hide this content? Their identity is never shown to you.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/communities/${slug}/reports/${report._id}/ban`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);
      flash(data.message);
      await load("reports");
      router.refresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Action failed", true);
    } finally {
      setBusy(false);
    }
  };

  const reviewAction = async (
    item: ReviewItem,
    action: "hide" | "delete" | "reviewed",
  ) => {
    if (action === "delete") {
      if (!window.confirm("Delete this content permanently?")) return;
    }
    setBusy(true);
    try {
      const url =
        item.targetType === "topic"
          ? `/api/topics/${item._id}`
          : `/api/responses/${item._id}`;
      let res: Response;
      if (action === "delete") {
        res = await fetch(url, { method: "DELETE" });
      } else {
        res = await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "hide"
              ? { isHidden: !item.isHidden }
              : { needsReview: false },
          ),
        });
      }
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);
      flash(data.message ?? "Done");
      await load("review");
      router.refresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Action failed", true);
    } finally {
      setBusy(false);
    }
  };

  const appealAction = async (
    appealId: string,
    action: "approve" | "deny",
  ) => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/communities/${slug}/appeals/${appealId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);
      flash(data.message);
      await load("approvals");
      router.refresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Action failed", true);
    } finally {
      setBusy(false);
    }
  };

  const decideRequest = async (
    requestId: string,
    action: "approve" | "deny",
  ) => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/communities/${slug}/join-requests/${requestId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);
      flash(data.message);
      await load("approvals");
      router.refresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Action failed", true);
    } finally {
      setBusy(false);
    }
  };

  const settingsAction = async (
    body: Record<string, unknown>,
  ): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await fetch(`/api/communities/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);
      flash(data.message);
      if (typeof data.inviteCode === "string") setInviteCode(data.inviteCode);
      if ("inviteCodeExpiresAt" in data) {
        const next = data.inviteCodeExpiresAt;
        setInviteExpiry(typeof next === "string" ? next : null);
      }
      router.refresh();
      return true;
    } catch (err) {
      flash(err instanceof Error ? err.message : "Action failed", true);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
          Teacher controls
        </h2>
        <div className="flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition ${
                tab === t
                  ? "bg-white text-zinc-900 shadow dark:bg-zinc-900 dark:text-white"
                  : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
          {notice}
        </p>
      )}

      {tab === "members" && (
        <div className="mt-4">
          {members.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No members yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {members.map((member) => (
                <li
                  key={member.userId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
                      {member.nickname}
                      {member.mutedUntil && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          Muted
                        </span>
                      )}
                      {member.strikes > 0 && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                          {member.strikes} strike
                          {member.strikes === 1 ? "" : "s"}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Joined {formatDate(member.joinedAt)}
                      {member.mutedUntil
                        ? ` · muted until ${formatDate(member.mutedUntil)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {member.mutedUntil ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => memberAction(member.userId, "unmute")}
                        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Unmute
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => memberAction(member.userId, "mute")}
                        className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-50 disabled:opacity-60 dark:border-amber-800 dark:text-amber-300"
                      >
                        Mute 24h
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => memberAction(member.userId, "remove")}
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => memberAction(member.userId, "ban")}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500 disabled:opacity-60"
                    >
                      Ban
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {banned.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Banned accounts ({banned.length})
              </h3>
              <ul className="flex flex-wrap gap-2">
                {banned.map((id) => (
                  <li
                    key={id}
                    className="flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    <span className="font-mono">{id.slice(-6)}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => memberAction(id, "unban")}
                      className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                    >
                      Unban
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === "review" && (
        <div className="mt-4">
          {reviews.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Nothing waiting for review. AI-flagged or budget-skipped posts
              show up here.
            </p>
          ) : (
            <ul className="space-y-3">
              {reviews.map((item) => (
                <li
                  key={`${item.targetType}-${item._id}`}
                  className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                    <span>
                      {item.targetType === "topic" ? "Post" : "Comment"} by{" "}
                      <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                        {item.authorNickname}
                      </span>
                    </span>
                    <span>{formatDate(item.createdAt)}</span>
                  </div>
                  {item.title && (
                    <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-white">
                      {item.title}
                    </p>
                  )}
                  <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                    {item.body}
                  </p>
                  {item.isHidden && (
                    <p className="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
                      Currently hidden from students
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => reviewAction(item, "hide")}
                      className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-50 disabled:opacity-60 dark:border-amber-800 dark:text-amber-300"
                    >
                      {item.isHidden ? "Unhide" : "Hide"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => reviewAction(item, "reviewed")}
                      className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-800 dark:text-emerald-300"
                    >
                      Mark reviewed
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => reviewAction(item, "delete")}
                      className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900/50 dark:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "reports" && (
        <div className="mt-4">
          {reports.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No pending reports.
            </p>
          ) : (
            <ul className="space-y-3">
              {reports.map((report) => (
                <li
                  key={report._id}
                  className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                    <span>
                      {report.targetType === "topic" ? "Post" : "Comment"} by{" "}
                      <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                        {report.authorNickname}
                      </span>{" "}
                      · reported by {report.reporterNickname}
                    </span>
                    <span>{formatDate(report.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
                    Reason: {report.reason}
                    {report.note ? ` — ${report.note}` : ""}
                  </p>
                  {report.targetTitle && (
                    <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-white">
                      {report.targetTitle}
                    </p>
                  )}
                  <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                    {report.targetBody}
                  </p>
                  {report.isHidden && (
                    <p className="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
                      Currently hidden from students
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => hideTarget(report)}
                      className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-50 disabled:opacity-60 dark:border-amber-800 dark:text-amber-300"
                    >
                      {report.isHidden ? "Unhide" : "Hide content"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => banAuthor(report)}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500 disabled:opacity-60"
                    >
                      Ban author (anonymous)
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => reportAction(report._id, "resolve")}
                      className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-800 dark:text-emerald-300"
                    >
                      Resolve
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => reportAction(report._id, "dismiss")}
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Dismiss
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "approvals" && (
        <div className="mt-4">
          {requests.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No pending join requests.
            </p>
          ) : (
            <ul className="space-y-2">
              {requests.map((request) => (
                <li
                  key={request._id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800"
                >
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                      {request.nickname}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Requested {formatDate(request.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => decideRequest(request._id, "approve")}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => decideRequest(request._id, "deny")}
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Deny
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Ban appeals ({appeals.length})
            </h3>
            {appeals.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No pending ban appeals.
              </p>
            ) : (
              <ul className="space-y-2">
                {appeals.map((appeal) => (
                  <li
                    key={appeal._id}
                    className="rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800"
                  >
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                      {appeal.nickname}
                    </p>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                      {appeal.message}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      Requested {formatDate(appeal.createdAt)} · identity stays
                      hidden
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => appealAction(appeal._id, "approve")}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                      >
                        Let back in
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => appealAction(appeal._id, "deny")}
                        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Deny
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div className="mt-4 space-y-5">
          <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">
              Invite code
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-zinc-100 px-3 py-1.5 font-mono text-sm font-bold tracking-widest text-zinc-900 dark:bg-zinc-800 dark:text-white">
                {inviteCode || "—"}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => settingsAction({ action: "rotate_invite", ttlHours })}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
              >
                Rotate code
              </button>
            </div>
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              {inviteExpiry
                ? `Expires ${formatDate(inviteExpiry)}`
                : "Never expires"}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={ttlHours === null ? "never" : String(ttlHours)}
                disabled={busy}
                onChange={(e) =>
                  setTtlHours(
                    e.target.value === "never" ? null : Number(e.target.value),
                  )
                }
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              >
                <option value="24">Expires in 1 day</option>
                <option value="168">Expires in 7 days</option>
                <option value="720">Expires in 30 days</option>
                <option value="never">Never expires</option>
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  settingsAction({ action: "set_invite_expiry", ttlHours })
                }
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Update expiry
              </button>
            </div>
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              Rotate if the code leaked. Students already inside stay inside.
            </p>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <span>
              <span className="block text-sm font-semibold text-zinc-900 dark:text-white">
                Require teacher approval to join
              </span>
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                Join requests show only nicknames.
              </span>
            </span>
            <input
              type="checkbox"
              checked={community.joinPolicy === "approval"}
              disabled={busy}
              onChange={(e) =>
                settingsAction({
                  action: "set_approval",
                  enabled: e.target.checked,
                })
              }
              className="h-4 w-4"
            />
          </label>

          {community.type === "educational" && (
            <>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <span>
                  <span className="block text-sm font-semibold text-zinc-900 dark:text-white">
                    AI moderation
                  </span>
                  <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                    Checks posts and comments beyond the built-in word filter.
                    Uses your Gemini free quota.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={community.aiModeration}
                  disabled={busy}
                  onChange={(e) =>
                    settingsAction({
                      action: "set_ai_moderation",
                      enabled: e.target.checked,
                    })
                  }
                  className="h-4 w-4"
                />
              </label>

              <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                  Required email formats
                </p>
                <input
                  type="text"
                  value={domainsInput}
                  onChange={(e) => setDomainsInput(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    settingsAction({
                      action: "set_required_domains",
                      domains: domainsInput
                        .split(",")
                        .map((domain) => domain.trim())
                        .filter(Boolean),
                    })
                  }
                  className="mt-2 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Save formats
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "log" && (
        <div className="mt-4">
          {logs.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No moderation activity yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {logs.map((entry) => (
                <li
                  key={entry._id}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800"
                >
                  <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                    {entry.actorName}
                  </span>{" "}
                  <span className="text-zinc-600 dark:text-zinc-300">
                    {entry.action.replaceAll("_", " ")}
                  </span>
                  {entry.detail ? (
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {" "}
                      — {entry.detail}
                    </span>
                  ) : null}
                  <span className="ml-2 text-zinc-400">
                    {formatDate(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
