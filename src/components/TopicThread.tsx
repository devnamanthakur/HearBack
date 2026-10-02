"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import type { ResponseSummary } from "@/lib/communityQueries";

interface TopicView {
  _id: string;
  title: string;
  body: string;
  role: "admin" | "member";
  authorName?: string;
  authorNickname?: string;
  isClosed: boolean;
  isHidden?: boolean;
  needsReview?: boolean;
  isMine: boolean;
  doubtCount: number;
  hasDoubts: boolean;
  notesUrl?: string;
  image?: { mime: string; data: string };
  attachment?: { name: string; mime: string };
  createdAt: Date;
}

function CommentAvatar({
  response,
  color,
}: {
  response: ResponseSummary;
  color: string;
}) {
  if (response.role === "admin") {
    return (
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black text-white"
        style={{ backgroundColor: color }}
      >
        {(response.authorName ?? "F").slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-xs font-black text-white">
      {(response.authorNickname ?? "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function TopicThread({
  community,
  topic,
  role,
  responses,
  myNickname,
}: {
  community: { slug: string; name: string; avatarColor: string; role: "admin" | "member" | "guest" };
  topic: TopicView;
  role: "admin" | "member";
  responses: ResponseSummary[];
  myNickname?: string;
}) {
  const router = useRouter();
  const params = useParams<{ slug: string; topicId: string }>();
  const slug = params.slug;
  const topicId = params.topicId;

  const [opinion, setOpinion] = useState("");
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{
    type: "topic" | "response";
    id: string;
  } | null>(null);
  const [reportReason, setReportReason] = useState("Harassment or abuse");
  const [reportNote, setReportNote] = useState("");
  const [reportedIds, setReportedIds] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState("");

  const isAdminView = role === "admin";
  // Hidden content is view-only for non-admins (the author can still see it).
  const locked = Boolean(topic.isHidden) && !isAdminView;

  const depthOf: Record<string, number> = {};
  responses.forEach((r) => {
    const parent = r.replyToId ? depthOf[r.replyToId] ?? 0 : 0;
    depthOf[r._id] = Math.min(parent + 1, 3);
  });

  const showToast = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 2500);
  };

  const authorLabel = (response: ResponseSummary) =>
    response.role === "admin"
      ? `Professor · ${response.authorName}`
      : response.authorNickname ?? "Anonymous";

  const postComment = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("body", opinion);
      if (replyToId) fd.append("replyToId", replyToId);
      if (imageFile) fd.append("image", imageFile);

      const res = await fetch(`/api/topics/${topicId}/responses`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message ?? "Failed to post");
        return;
      }
      setOpinion("");
      setReplyToId(null);
      setImageFile(null);
      setAiPreview(null);
      showToast("Posted");
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const runAi = async (action: "correct" | "translate") => {
    if (!opinion.trim()) {
      setError("Write something first, then use AI.");
      return;
    }
    setAiBusy(true);
    setError("");
    try {
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: opinion, action }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message ?? "AI request failed");
        return;
      }
      setAiPreview(data.suggested);
    } catch {
      setError("Something went wrong with AI.");
    } finally {
      setAiBusy(false);
    }
  };

  const toggleDoubt = async (responseId: string) => {
    try {
      await fetch("/api/doubts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: "response", targetId: responseId }),
      });
      router.refresh();
    } catch {
      showToast("Something went wrong");
    }
  };

  const closeTopic = async (isClosed: boolean) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/topics/${topicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isClosed }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message ?? "Failed to update topic");
        return;
      }
      showToast(data.message);
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const setHidden = async (
    type: "topic" | "response",
    id: string,
    isHidden: boolean,
  ) => {
    setBusy(true);
    try {
      const url =
        type === "topic" ? `/api/topics/${id}` : `/api/responses/${id}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isHidden }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message ?? "Failed to update content");
        return;
      }
      showToast(data.message);
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const deleteContent = async (type: "topic" | "response", id: string) => {
    if (!window.confirm("Delete this permanently? This cannot be undone.")) {
      return;
    }
    setBusy(true);
    try {
      const url =
        type === "topic" ? `/api/topics/${id}` : `/api/responses/${id}`;
      const res = await fetch(url, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message ?? "Failed to delete");
        return;
      }
      showToast(data.message);
      if (type === "topic") {
        router.push(`/communities/${slug}`);
      } else {
        router.refresh();
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const submitReport = async () => {
    if (!reportTarget) return;
    setBusy(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: reportTarget.type,
          targetId: reportTarget.id,
          reason: reportReason,
          note: reportNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message ?? "Failed to report");
        return;
      }
      setReportedIds((prev) => ({ ...prev, [reportTarget.id]: true }));
      setReportTarget(null);
      setReportNote("");
      showToast(data.message);
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const imagePreview = imageFile ? URL.createObjectURL(imageFile) : null;

  return (
    <div className="min-h-screen bg-zinc-100 px-4 py-10 dark:bg-zinc-900">
      <div className="mx-auto max-w-3xl">
        <Link
          href={`/communities/${slug}`}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
        >
          ← Back to {community.name}
        </Link>

        <div className="mt-4 mb-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black text-white"
              style={{ backgroundColor: community.avatarColor }}
            >
              {community.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="text-xs text-zinc-400">
              {community.name} · {new Date(topic.createdAt).toLocaleString()}
            </span>
            {topic.isClosed && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                Closed
              </span>
            )}
            {topic.isHidden && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                Hidden from students
              </span>
            )}
            {topic.needsReview && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                Needs review
              </span>
            )}
            {topic.isMine && (
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                You
              </span>
            )}
          </div>
          <h1 className="mt-3 text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
            {topic.title}
          </h1>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            {topic.body}
          </p>

          {topic.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`data:${topic.image.mime};base64,${topic.image.data}`}
              alt=""
              className="mt-3 max-h-96 rounded-xl border border-zinc-200 object-cover dark:border-zinc-800"
            />
          )}

          {(topic.notesUrl || topic.attachment) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {topic.notesUrl && (
                <a
                  href={topic.notesUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300"
                >
                  Open notes
                </a>
              )}
              {topic.attachment && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {topic.attachment.name} (PDF)
                </span>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                {topic.role === "admin"
                  ? `Professor · ${topic.authorName}`
                  : topic.authorNickname ?? "Anonymous"}
              </span>
              <button
                type="button"
                onClick={() => toggleDoubt(topic._id)}
                disabled={locked}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
                  topic.hasDoubts
                    ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                {topic.hasDoubts ? "●" : "○"} Same doubt · {topic.doubtCount}
              </button>
            </div>
            {isAdminView ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => closeTopic(!topic.isClosed)}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  {topic.isClosed ? "Reopen topic" : "Close topic"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setHidden("topic", topic._id, !topic.isHidden)}
                  className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-50 disabled:opacity-60 dark:border-amber-800 dark:text-amber-300"
                >
                  {topic.isHidden ? "Unhide topic" : "Hide topic"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => deleteContent("topic", topic._id)}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500 disabled:opacity-60"
                >
                  Delete
                </button>
              </div>
            ) : (
              !topic.isMine && (
                <button
                  type="button"
                  disabled={Boolean(reportedIds[topic._id])}
                  onClick={() => {
                    setReportTarget({ type: "topic", id: topic._id });
                    setError("");
                  }}
                  className="text-xs font-medium text-zinc-400 transition hover:text-red-500 disabled:opacity-60"
                >
                  {reportedIds[topic._id] ? "Reported" : "Report"}
                </button>
              )
            )}
          </div>
        </div>

        {locked && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
            This topic has been hidden by faculty. It is visible to you because
            you are its author, but replies and doubt marks are disabled.
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        {!topic.isClosed && !locked && (
          <div className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-zinc-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
                  {replyToId
                    ? `Replying to ${authorLabel(
                        responses.find((r) => r._id === replyToId) ??
                          ({} as ResponseSummary),
                      )}`
                    : isAdminView
                      ? "Reply as the professor"
                      : "Share your opinion"}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {isAdminView
                    ? "Your reply is shown with your name — students can see who answered."
                    : `Completely anonymous. Only your nickname "${myNickname ?? "…"}" is visible to others.`}
                </p>
              </div>
              {replyToId && (
                <button
                  type="button"
                  onClick={() => setReplyToId(null)}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                >
                  Cancel reply
                </button>
              )}
            </div>

            {aiPreview && (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/40">
                <p className="mb-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  AI suggestion
                </p>
                <p className="text-sm text-emerald-800 dark:text-emerald-200">
                  {aiPreview}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOpinion(aiPreview);
                      setAiPreview(null);
                    }}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
                  >
                    Use this version
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiPreview(null)}
                    className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-300"
                  >
                    Keep mine
                  </button>
                </div>
              </div>
            )}

            <form className="mt-3 space-y-3" onSubmit={postComment}>
              <textarea
                rows={3}
                placeholder={
                  isAdminView
                    ? "Answer the question or clear a doubt..."
                    : "Your honest opinion — no social fear here..."
                }
                value={opinion}
                onChange={(e) => {
                  setOpinion(e.target.value);
                  setAiPreview(null);
                }}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
              />

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={aiBusy}
                  onClick={() => runAi("correct")}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-60 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-300"
                >
                  {aiBusy ? "Thinking..." : "Fix my English"}
                </button>
                <button
                  type="button"
                  disabled={aiBusy}
                  onClick={() => runAi("translate")}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-60 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-300"
                >
                  Translate to English
                </button>
                <label className="ml-auto text-xs text-zinc-500 file:mr-2 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-600 hover:file:bg-indigo-100 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-indigo-400">
                  {imageFile ? imageFile.name : "Add image"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>

              {imagePreview && (
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreview}
                    alt="preview"
                    className="h-24 w-24 rounded-lg object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setImageFile(null)}
                    className="text-xs font-medium text-red-500 hover:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "Posting..." : isAdminView ? "Post reply" : "Post anonymously"}
              </button>
            </form>
          </div>
        )}

        <div>
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white">
            Comments{" "}
            <span className="text-sm font-normal text-zinc-400">
              ({responses.length})
            </span>
          </h2>
          {responses.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-300 bg-white/50 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400">
              No comments yet. Be the first to share your opinion.
            </p>
          ) : (
            <ul className="space-y-3">
              {responses.map((response) => {
                const depth = depthOf[response._id] ?? 0;
                return (
                  <li
                    key={response._id}
                    style={{ marginLeft: `${depth * 20}px` }}
                  >
                    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900">
                      <div className="flex items-center gap-2">
                        <CommentAvatar response={response} color={community.avatarColor} />
                        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                          {authorLabel(response)}
                        </span>
                        {response.isMine && (
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                            You
                          </span>
                        )}
                        {response.isHidden && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                            Hidden
                          </span>
                        )}
                        {response.needsReview && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                            Needs review
                          </span>
                        )}
                        <span className="ml-auto text-xs text-zinc-400">
                          {new Date(response.createdAt).toLocaleString()}
                        </span>
                      </div>

                      {response.replyToId && (
                        <p className="mt-2 text-xs text-zinc-400">
                          ↳ In reply to{" "}
                          {(() => {
                            const parent = responses.find(
                              (r) => r._id === response.replyToId,
                            );
                            return parent ? authorLabel(parent) : "a comment";
                          })()}
                        </p>
                      )}

                      <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-100">
                        {response.body}
                      </p>

                      {response.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`data:${response.image.mime};base64,${response.image.data}`}
                          alt=""
                          className="mt-2 max-h-64 rounded-xl border border-zinc-200 object-cover dark:border-zinc-800"
                        />
                      )}

                      <div className="mt-3 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => toggleDoubt(response._id)}
                          disabled={locked}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
                            response.hasDoubts
                              ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                          }`}
                        >
                          {response.hasDoubts ? "●" : "○"} Same doubt ·{" "}
                          {response.doubtCount}
                        </button>
                        {!topic.isClosed && !locked && (
                          <button
                            type="button"
                            onClick={() => {
                              setReplyToId(response._id);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                          >
                            Reply
                          </button>
                        )}
                        {isAdminView ? (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                setHidden(
                                  "response",
                                  response._id,
                                  !response.isHidden,
                                )
                              }
                              className="text-xs font-medium text-amber-600 hover:text-amber-500 disabled:opacity-60"
                            >
                              {response.isHidden ? "Unhide" : "Hide"}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                deleteContent("response", response._id)
                              }
                              className="text-xs font-medium text-red-500 hover:text-red-400 disabled:opacity-60"
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          !response.isMine && (
                            <button
                              type="button"
                              disabled={Boolean(reportedIds[response._id])}
                              onClick={() => {
                                setReportTarget({
                                  type: "response",
                                  id: response._id,
                                });
                                setError("");
                              }}
                              className="text-xs font-medium text-zinc-400 transition hover:text-red-500 disabled:opacity-60"
                            >
                              {reportedIds[response._id]
                                ? "Reported"
                                : "Report"}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {reportTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-zinc-900">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
              Report {reportTarget.type === "topic" ? "this post" : "this comment"}
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              A teacher will review it. They can hide the content or ban the
              author anonymously — your identity is never revealed.
            </p>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Reason
              </span>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              >
                <option>Harassment or abuse</option>
                <option>Hate speech</option>
                <option>Vulgar or sexual content</option>
                <option>Threats or violence</option>
                <option>Spam or advertisement</option>
                <option>Other</option>
              </select>
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Anything else? (optional)
              </span>
              <textarea
                rows={2}
                value={reportNote}
                onChange={(e) => setReportNote(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportTarget(null)}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={submitReport}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500 disabled:opacity-60"
              >
                {busy ? "Sending..." : "Send report"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-xl dark:bg-white dark:text-zinc-900">
          {toast}
        </div>
      )}
    </div>
  );
}