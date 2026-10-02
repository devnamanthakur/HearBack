"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import type { CommunitySummary } from "@/lib/communityQueries";
import NicknamePicker from "@/components/NicknamePicker";

const COLORS = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
];

function TypeBadge({ type }: { type: CommunitySummary["type"] }) {
  return type === "educational" ? (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
      Educational
    </span>
  ) : (
    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      Open
    </span>
  );
}

export default function CommunityBrowser({
  mine,
  discover,
  schoolDomain,
}: {
  mine: CommunitySummary[];
  discover: CommunitySummary[];
  schoolDomain: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"create" | "join">("create");
  const [discoverTab, setDiscoverTab] = useState<
    "open" | "institution" | "others"
  >("open");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [communityType, setCommunityType] = useState<"normal" | "educational">(
    "normal",
  );
  const [requiredDomains, setRequiredDomains] = useState("");
  const [aiModeration, setAiModeration] = useState(true);
  const [inviteCode, setInviteCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [formError, setFormError] = useState("");
  const [bannedSlug, setBannedSlug] = useState<string | null>(null);
  const [inviteTtl, setInviteTtl] = useState<number | null>(24 * 7);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<CommunitySummary | null>(null);
  const [toast, setToast] = useState("");

  const showToast = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 2500);
  };

  const createCommunity = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setLoading(true);
    try {
      const res = await fetch("/api/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          avatarColor: color,
          type: communityType,
          requiredEmailDomains:
            communityType === "educational"
              ? requiredDomains
                  .split(",")
                  .map((domain) => domain.trim())
                  .filter(Boolean)
              : [],
          aiModeration,
          inviteTtlHours: inviteTtl,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFormError(data.message ?? "Failed to create community");
        return;
      }
      setCreated(data.community as CommunitySummary);
      setName("");
      setDescription("");
      setRequiredDomains("");
      showToast("Community created");
      router.refresh();
    } catch {
      setFormError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const joinCommunity = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setBannedSlug(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/join-community`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode, nickname }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.banned && typeof data.slug === "string") {
          setBannedSlug(data.slug);
          return;
        }
        setFormError(data.message ?? "Failed to join community");
        return;
      }
      setInviteCode("");
      if (data.pending) {
        showToast("Join request sent — waiting for teacher approval");
      } else {
        showToast(data.nickname ? `Joined as ${data.nickname}` : "Joined community");
      }
      router.refresh();
    } catch {
      setFormError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const copyInvite = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Code copied");
    } catch {
      showToast("Copy manually: " + text);
    }
  };

  const roleLabel = (role: CommunitySummary["role"]) =>
    role === "admin" ? "Admin" : role === "member" ? "Member" : "Not joined";

  const openCommunities = discover.filter((c) => c.type !== "educational");
  const institutionCommunities = discover.filter(
    (c) => c.type === "educational" && c.viewerCanJoin,
  );
  const otherCollegeCommunities = discover.filter(
    (c) => c.type === "educational" && !c.viewerCanJoin,
  );
  const discoverList =
    discoverTab === "institution"
      ? institutionCommunities
      : discoverTab === "others"
        ? otherCollegeCommunities
        : openCommunities;

  return (
    <div className="min-h-screen bg-zinc-100 px-4 py-10 dark:bg-zinc-900">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Communities
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Create or join anonymous classroom communities
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              Dashboard
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

        {!schoolDomain && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-900/50 dark:bg-emerald-950/40">
            <div>
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                Verify your school email
              </p>
              <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                Educational communities are only visible to verified students of
                that institution. Add your college email from the dashboard to
                unlock them.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500"
            >
              Verify now
            </Link>
          </div>
        )}

        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-zinc-900">
            <div className="mb-4 flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
              {(["create", "join"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTab(t);
                    setFormError("");
                    setCreated(null);
                  }}
                  className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold transition ${
                    tab === t
                      ? "bg-white text-zinc-900 shadow dark:bg-zinc-900 dark:text-white"
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  {t === "create" ? "Create community" : "Join with code"}
                </button>
              ))}
            </div>

            {formError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                {formError}
              </div>
            )}

            {bannedSlug && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                You are banned from this community and cannot rejoin.{" "}
                <Link
                  href={`/communities/${bannedSlug}`}
                  className="font-semibold underline"
                >
                  Request unban
                </Link>{" "}
                — the teacher decides without ever seeing who you are.
              </div>
            )}

            {created && (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                <p className="font-semibold">Community created!</p>
                <p className="mt-1">
                  Share this invite code with your members:
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="rounded-lg bg-white px-3 py-1.5 font-mono text-base font-bold tracking-widest text-zinc-900 dark:bg-zinc-900 dark:text-white">
                    {created.inviteCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyInvite(created.inviteCode ?? "")}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
                  >
                    Copy
                  </button>
                </div>
                <p className="mt-1 text-xs">
                  {created.inviteCodeExpiresAt
                    ? `Expires ${new Date(created.inviteCodeExpiresAt).toLocaleString()}`
                    : "This code never expires."}
                </p>
                {created.type === "educational" && (
                  <p className="mt-2 text-xs">
                    Only students with a verified email matching{" "}
                    {created.requiredEmailDomains
                      .map((domain) => `@${domain}`)
                      .join(", ")}{" "}
                    can join.
                  </p>
                )}
              </div>
            )}

            {tab === "create" ? (
              <form className="space-y-4" onSubmit={createCommunity}>
                <div>
                  <label
                    htmlFor="community-name"
                    className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Community name
                  </label>
                  <input
                    id="community-name"
                    type="text"
                    placeholder="e.g. DBMS Doubt Corner"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="community-desc"
                    className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Description
                  </label>
                  <textarea
                    id="community-desc"
                    rows={3}
                    placeholder="What is this community about?"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
                  />
                </div>
                <div>
                  <span className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Community type
                  </span>
                  <div className="flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
                    {(["normal", "educational"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setCommunityType(t)}
                        className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold transition ${
                          communityType === t
                            ? "bg-white text-zinc-900 shadow dark:bg-zinc-900 dark:text-white"
                            : "text-zinc-500 dark:text-zinc-400"
                        }`}
                      >
                        {t === "normal" ? "Normal (open)" : "Educational"}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {communityType === "educational"
                      ? "Only students with a verified school email matching your formats can join and see it. AI moderation is available."
                      : "Anyone with an account and the invite code can join. Fully anonymous with no identity reveal."}
                  </p>
                </div>
                {communityType === "educational" && (
                  <>
                    <div>
                      <label
                        htmlFor="community-domains"
                        className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                      >
                        Required email format(s)
                      </label>
                      <input
                        id="community-domains"
                        type="text"
                        placeholder="e.g. nitk.edu.in, nitk.ac.in or edu.in"
                        value={requiredDomains}
                        onChange={(e) => setRequiredDomains(e.target.value)}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
                      />
                      <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                        Comma separated. Use a broad format like edu.in, or a
                        specific one like nitk.edu.in.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                      <input
                        type="checkbox"
                        checked={aiModeration}
                        onChange={(e) => setAiModeration(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-300"
                      />
                      AI moderation on new posts and comments
                    </label>
                  </>
                )}
                <div>
                  <span className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Badge color
                  </span>
                  <div className="flex gap-2">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Select color ${c}`}
                        onClick={() => setColor(c)}
                        className={`h-7 w-7 rounded-full transition ${
                          color === c
                            ? "ring-2 ring-zinc-900 ring-offset-2 dark:ring-white"
                            : ""
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="invite-ttl"
                    className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Invite code expiry
                  </label>
                  <select
                    id="invite-ttl"
                    value={inviteTtl === null ? "never" : String(inviteTtl)}
                    onChange={(e) =>
                      setInviteTtl(
                        e.target.value === "never"
                          ? null
                          : Number(e.target.value),
                      )
                    }
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  >
                    <option value="24">1 day</option>
                    <option value="168">7 days</option>
                    <option value="720">30 days</option>
                    <option value="never">Never expires</option>
                  </select>
                  <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                    After this, the code stops working. You can rotate it any time
                    from Teacher controls.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Creating..." : "Create community"}
                </button>
              </form>
            ) : (
              <form className="space-y-4" onSubmit={joinCommunity}>
                <div>
                  <label
                    htmlFor="invite-code"
                    className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Invite code
                  </label>
                  <input
                    id="invite-code"
                    type="text"
                    placeholder="e.g. ABCDEF"
                    autoComplete="off"
                    value={inviteCode}
                    onChange={(e) =>
                      setInviteCode(
                        e.target.value.toUpperCase().replace(/\s/g, ""),
                      )
                    }
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-center font-mono text-lg tracking-[0.4em] text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
                  />
                </div>
                <NicknamePicker onChange={setNickname} />
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Joining an educational community requires a verified school
                  email for that college. Your nickname is what everyone —
                  including teachers — sees in the feed.
                </p>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Joining..." : "Join community"}
                </button>
              </form>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white/70 p-6 shadow-xl backdrop-blur dark:border-white/10 dark:bg-zinc-900/70">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white">
              Your communities{" "}
              <span className="text-sm font-normal text-zinc-400">
                ({mine.length})
              </span>
            </h2>
            {mine.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                You haven&apos;t joined any communities yet. Create one or enter
                an invite code.
              </p>
            ) : (
              <ul className="space-y-3">
                {mine.map((c) => (
                  <li
                    key={c.slug}
                    className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900"
                  >
                    <Link
                      href={`/communities/${c.slug}`}
                      className="flex min-w-0 items-center gap-3"
                    >
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white"
                        style={{ backgroundColor: c.avatarColor }}
                      >
                        {c.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 truncate text-sm font-semibold text-zinc-900 dark:text-white">
                          {c.name}
                          <TypeBadge type={c.type} />
                        </span>
                        <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                          {c.memberCount} members · {roleLabel(c.role)}
                        </span>
                      </span>
                    </Link>
                    {c.role === "admin" && c.inviteCode && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          copyInvite(c.inviteCode ?? "");
                        }}
                        className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 font-mono text-xs font-bold tracking-widest text-zinc-700 transition hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-500"
                        title="Copy invite code"
                      >
                        {c.inviteCode}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
              Discover communities
            </h2>
            <div className="flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
              <button
                type="button"
                onClick={() => setDiscoverTab("open")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  discoverTab === "open"
                    ? "bg-white text-zinc-900 shadow dark:bg-zinc-900 dark:text-white"
                    : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                Open ({openCommunities.length})
              </button>
              <button
                type="button"
                onClick={() => setDiscoverTab("institution")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  discoverTab === "institution"
                    ? "bg-white text-zinc-900 shadow dark:bg-zinc-900 dark:text-white"
                    : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                My institution ({institutionCommunities.length})
              </button>
              <button
                type="button"
                onClick={() => setDiscoverTab("others")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  discoverTab === "others"
                    ? "bg-white text-zinc-900 shadow dark:bg-zinc-900 dark:text-white"
                    : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                Other colleges ({otherCollegeCommunities.length})
              </button>
            </div>
          </div>

          {discoverTab === "institution" && schoolDomain && (
            <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
              Showing educational communities for @{schoolDomain}
            </p>
          )}
          {discoverTab === "institution" && !schoolDomain && (
            <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
              Verify your school email to see your college&apos;s educational
              communities.
            </p>
          )}
          {discoverTab === "others" && (
            <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
              Communities from other colleges (for example @nitk.edu.in or
              @iitb.ac.in). You can look, but joining still requires a verified
              school email that matches.
            </p>
          )}

          {discoverList.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-300 bg-white/50 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400">
              {discoverTab === "institution"
                ? "No educational communities for your institution yet."
                : discoverTab === "others"
                  ? "No other colleges' communities to show."
                  : "No open communities yet."}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {discoverList.map((c) => (
                <Link
                  key={c.slug}
                  href={`/communities/${c.slug}`}
                  className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-zinc-400 hover:shadow-md dark:border-white/10 dark:bg-zinc-900 dark:hover:border-zinc-500"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white"
                      style={{ backgroundColor: c.avatarColor }}
                    >
                      {c.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-sm font-semibold text-zinc-900 dark:text-white">
                        {c.name}
                        <TypeBadge type={c.type} />
                        {c.type === "educational" && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              c.viewerCanJoin
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                            }`}
                          >
                            {c.viewerCanJoin ? "Joinable" : "Other college"}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {c.memberCount} members · {roleLabel(c.role)}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">
                    {c.description}
                  </p>
                  {c.type === "educational" &&
                    c.requiredEmailDomains.length > 0 && (
                      <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                        Requires {c.requiredEmailDomains
                          .map((domain) => `@${domain}`)
                          .join(" or ")}
                      </p>
                    )}
                </Link>
              ))}
            </div>
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
