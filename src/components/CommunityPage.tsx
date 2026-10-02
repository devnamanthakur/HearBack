"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import type { CommunitySummary, TopicSummary } from "@/lib/communityQueries";
import NicknamePicker from "@/components/NicknamePicker";
import CommunityAdmin from "@/components/CommunityAdmin";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function AuthorBadge({
  topic,
}: {
  topic: TopicSummary;
}) {
  if (topic.role === "admin") {
    return (
      <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
        Professor · {topic.authorName}
      </span>
    );
  }
  return (
    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
      {topic.authorNickname ?? "Anonymous"}
    </span>
  );
}

export default function CommunityPage({
  community,
  topics,
}: {
  community: CommunitySummary;
  topics: TopicSummary[];
}) {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [notesUrl, setNotesUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [joining, setJoining] = useState(false);
  const [posting, setPosting] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const [needsSchoolEmail, setNeedsSchoolEmail] = useState(false);
  const [bannedFromJoin, setBannedFromJoin] = useState(false);
  const [appealMessage, setAppealMessage] = useState("");
  const [appealSent, setAppealSent] = useState(false);
  const [appealError, setAppealError] = useState("");
  const [toast, setToast] = useState("");

  const showToast = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 2500);
  };

  const isMember = community.role !== "guest";
  const isAdmin = community.role === "admin";

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setJoining(true);
    try {
      const res = await fetch("/api/join-community", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: joinCode, nickname }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.banned) {
          setBannedFromJoin(true);
          return;
        }
        setError(data.message ?? "Failed to join");
        if (data.needsSchoolEmail) setNeedsSchoolEmail(true);
        return;
      }
      if (data.pending) {
        showToast("Join request sent — waiting for teacher approval");
      } else {
        showToast(
          data.nickname ? `Joined as ${data.nickname}` : "Joined community",
        );
      }
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setJoining(false);
    }
  };

  const submitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    setAppealError("");
    setJoining(true);
    try {
      const res = await fetch(`/api/communities/${slug}/appeals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: appealMessage }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setAppealError(data.message ?? "Could not send appeal");
        return;
      }
      setAppealSent(true);
    } catch {
      setAppealError("Something went wrong.");
    } finally {
      setJoining(false);
    }
  };

  const generateDescription = async () => {
    if (!pdfFile) return;
    setAiBusy(true);
    setFormError("");
    try {
      const fd = new FormData();
      fd.append("attachment", pdfFile);
      const res = await fetch("/api/ai/notes-summary", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFormError(data.message ?? "AI could not read the PDF");
        return;
      }
      setAiPreview(data.suggested);
    } catch {
      setFormError("Something went wrong with AI.");
    } finally {
      setAiBusy(false);
    }
  };

  const postTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setPosting(true);
    try {
      const fd = new FormData();
      fd.append("title", title);
      fd.append("body", body);
      if (notesUrl.trim()) fd.append("notesUrl", notesUrl.trim());
      if (imageFile) fd.append("image", imageFile);
      if (pdfFile) fd.append("attachment", pdfFile);

      const res = await fetch(`/api/communities/${slug}/topics`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFormError(data.message ?? "Failed to post topic");
        return;
      }
      setTitle("");
      setBody("");
      setNotesUrl("");
      setImageFile(null);
      setPdfFile(null);
      setAiPreview(null);
      showToast("Topic posted");
      router.refresh();
    } catch {
      setFormError("Something went wrong.");
    } finally {
      setPosting(false);
    }
  };

  const toggleDoubt = async (topicId: string) => {
    try {
      await fetch("/api/doubts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: "topic", targetId: topicId }),
      });
      router.refresh();
    } catch {
      showToast("Something went wrong");
    }
  };

  const copyInvite = async () => {
    if (!community.inviteCode) return;
    try {
      await navigator.clipboard.writeText(community.inviteCode);
      showToast("Invite code copied");
    } catch {
      showToast("Copy manually: " + community.inviteCode);
    }
  };

  const imagePreview = imageFile ? URL.createObjectURL(imageFile) : null;

  return (
    <div className="min-h-screen bg-zinc-100 px-4 py-10 dark:bg-zinc-900">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/communities"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
        >
          ← Back to communities
        </Link>

        <div className="mt-4 mb-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-zinc-900">
          <div className="flex items-center gap-4">
            <span
              className="flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-black text-white"
              style={{ backgroundColor: community.avatarColor }}
            >
              {community.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
                {community.name}
                {community.type === "educational" ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    Educational
                  </span>
                ) : (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    Open community
                  </span>
                )}
              </h1>
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                {community.memberCount} members ·{" "}
                {community.role === "admin"
                  ? "You are an admin"
                  : community.role === "member"
                    ? `You are anonymous as ${community.nickname ?? "—"}`
                    : "Not joined yet"}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            {community.description}
          </p>

          {community.type === "educational" && (
            <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              {community.joinPolicy === "approval"
                ? "Join requests need teacher approval. "
                : ""}
              Only students with a verified email like{" "}
              {community.requiredEmailDomains
                .map((domain) => `@${domain}`)
                .join(" or ") || "@yourcollege.edu.in"}{" "}
              can join. Reports are reviewed by faculty, who can hide content or
              ban an author from the community without ever seeing who they are.
            </p>
          )}

          {community.joinPolicy === "approval" && (
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              New members join only after a teacher approves their request.
            </p>
          )}

          {!isMember &&
            community.type === "educational" &&
            !community.viewerCanJoin && (
              <p className="mt-2 rounded-xl bg-amber-50 px-4 py-2.5 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                This is another college&apos;s community. It only accepts a
                verified{" "}
                {community.requiredEmailDomains
                  .map((domain) => `@${domain}`)
                  .join(" or ") || "school"}{" "}
                email, which your account doesn&apos;t have — so you can look,
                but you won&apos;t be able to join.
              </p>
            )}

          {isAdmin && community.inviteCode && (
            <div className="mt-4 flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 dark:border-indigo-900/50 dark:bg-indigo-950/40">
              <div>
                <p className="text-sm font-medium text-indigo-800 dark:text-indigo-200">
                  Invite code
                </p>
                <p className="text-xs text-indigo-600 dark:text-indigo-300">
                  Share this so members can join
                  {community.inviteCodeExpiresAt
                    ? ` · expires ${new Date(community.inviteCodeExpiresAt).toLocaleString()}`
                    : " · never expires"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-white px-3 py-1.5 font-mono text-base font-bold tracking-widest text-zinc-900 dark:bg-zinc-900 dark:text-white">
                  {community.inviteCode}
                </span>
                <button
                  type="button"
                  onClick={copyInvite}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {!isMember && (community.isBanned || bannedFromJoin) && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/40">
              <p className="text-sm text-red-700 dark:text-red-300">
                You are banned from this community and cannot rejoin. If you
                think this was a mistake, you can ask the teacher to let you
                back in — they never see who you are.
              </p>
              {appealSent ? (
                <p className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  Your appeal was sent. The teacher will decide.
                </p>
              ) : (
                <form className="mt-3 space-y-2" onSubmit={submitAppeal}>
                  <textarea
                    rows={2}
                    placeholder="Explain why you should be let back in..."
                    value={appealMessage}
                    onChange={(e) => setAppealMessage(e.target.value)}
                    className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-red-400 dark:border-red-900/50 dark:bg-zinc-900 dark:text-white"
                  />
                  {appealError && (
                    <p className="text-xs text-red-600 dark:text-red-400">
                      {appealError}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={joining}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500 disabled:opacity-60"
                  >
                    {joining ? "Sending..." : "Request unban"}
                  </button>
                </form>
              )}
            </div>
          )}

          {!isMember && !(community.isBanned || bannedFromJoin) && (
            <form className="mt-4 space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800" onSubmit={join}>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Enter the invite code to join this community:
              </p>
              {error && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {error}
                  {needsSchoolEmail && (
                    <>
                      {" "}
                      <Link
                        href="/dashboard"
                        className="font-semibold underline"
                      >
                        Verify your school email
                      </Link>
                    </>
                  )}
                </p>
              )}
              <input
                type="text"
                placeholder="ABCDEF"
                autoComplete="off"
                value={joinCode}
                onChange={(e) =>
                  setJoinCode(e.target.value.toUpperCase().replace(/\s/g, ""))
                }
                className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-center font-mono text-lg tracking-[0.4em] text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
              />
              <NicknamePicker onChange={setNickname} />
              <button
                type="submit"
                disabled={joining}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:opacity-90 disabled:opacity-60"
              >
                {joining
                  ? "Joining..."
                  : community.joinPolicy === "approval"
                    ? "Request to join"
                    : "Join community"}
              </button>
            </form>
          )}
        </div>

        {isAdmin && <CommunityAdmin slug={slug} community={community} />}

        {isMember && (
          <div className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-zinc-900">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
              Start a post
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {isAdmin
                ? "Post as yourself to share today's lecture, notes and questions."
                : community.type === "educational"
                  ? "Post anonymously as your nickname. Faculty moderate by hiding content or banning an author anonymously — they never see who you are."
                  : "Post anonymously as your nickname. Your identity stays hidden from everyone in this community."}
            </p>
            {formError && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                {formError}
              </p>
            )}
            <form className="mt-3 space-y-3" onSubmit={postTopic}>
              <input
                type="text"
                placeholder="Post title (e.g. Today's lecture — Process Scheduling)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
              />
              <textarea
                rows={3}
                placeholder="Description of the topic or question..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
              />

              {aiPreview && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/40">
                  <p className="mb-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    AI-suggested description (from your PDF)
                  </p>
                  <p className="text-sm text-emerald-800 dark:text-emerald-200">
                    {aiPreview}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setBody(aiPreview);
                        setAiPreview(null);
                      }}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
                    >
                      Use this description
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiPreview(null)}
                      className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-300"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              )}

              {isAdmin && (
                <input
                  type="url"
                  placeholder="Notes link (e.g. Google Drive / OneDrive) — optional"
                  value={notesUrl}
                  onChange={(e) => setNotesUrl(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
                />
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    {isAdmin ? "Add an image (optional)" : "Add an image (optional)"}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                    className="w-full text-xs text-zinc-500 file:mr-2 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-indigo-600 hover:file:bg-indigo-100 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-indigo-400"
                  />
                  {imagePreview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imagePreview}
                      alt="preview"
                      className="mt-2 h-24 w-24 rounded-lg object-cover"
                    />
                  )}
                </label>

                {isAdmin && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Upload notes PDF (optional)
                    </span>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                      className="w-full text-xs text-zinc-500 file:mr-2 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-indigo-600 hover:file:bg-indigo-100 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-indigo-400"
                    />
                    {pdfFile && (
                      <button
                        type="button"
                        disabled={aiBusy}
                        onClick={generateDescription}
                        className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-60 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-300"
                      >
                        {aiBusy ? "Reading PDF..." : "Auto-generate description"}
                      </button>
                    )}
                  </label>
                )}
              </div>

              <button
                type="submit"
                disabled={posting}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {posting ? "Posting..." : "Post"}
              </button>
            </form>
          </div>
        )}

        <div>
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white">
            Posts{" "}
            <span className="text-sm font-normal text-zinc-400">
              ({topics.length})
            </span>
          </h2>
          {!isMember ? (
            <p className="rounded-2xl border border-dashed border-zinc-300 bg-white/50 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400">
              Join this community to see posts and share your anonymous opinion.
            </p>
          ) : topics.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-300 bg-white/50 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400">
              No posts yet. Start the first discussion!
            </p>
          ) : (
            <ul className="space-y-4">
              {topics.map((topic) => (
                <li key={topic._id}>
                  <Link
                    href={`/communities/${slug}/topics/${topic._id}`}
                    className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-zinc-400 hover:shadow-md dark:border-white/10 dark:bg-zinc-900 dark:hover:border-zinc-500"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                      {topic.isClosed && (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                          Closed
                        </span>
                      )}
                      {topic.isHidden && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          Hidden
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
                      <span>{new Date(topic.createdAt).toLocaleString()}</span>
                    </div>
                    <h3 className="mt-1 text-base font-semibold text-zinc-900 dark:text-white">
                      {topic.title}
                    </h3>
                    <p className="mt-1 line-clamp-3 text-sm text-zinc-500 dark:text-zinc-400">
                      {topic.body}
                    </p>

                    {topic.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`data:${topic.image.mime};base64,${topic.image.data}`}
                        alt=""
                        className="mt-3 max-h-64 rounded-xl border border-zinc-200 object-cover dark:border-zinc-800"
                      />
                    )}

                    {topic.notesUrl && (
                      <span className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                        Notes link
                      </span>
                    )}
                    {topic.attachment && (
                      <span className="mt-3 ml-2 inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {topic.attachment.name} · {formatBytes(topic.attachment.size)}
                      </span>
                    )}

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <AuthorBadge topic={topic} />
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-zinc-400">
                          {topic.responseCount}{" "}
                          {topic.responseCount === 1 ? "comment" : "comments"}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            toggleDoubt(topic._id);
                          }}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                            topic.hasDoubts
                              ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                          }`}
                        >
                          {topic.hasDoubts ? "●" : "○"} Same doubt · {topic.doubtCount}
                        </button>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
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