"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SchoolEmailCard({
  schoolEmail,
  schoolDomain,
}: {
  schoolEmail?: string;
  schoolDomain?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"idle" | "code">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [demoCode, setDemoCode] = useState("");

  const verified = Boolean(schoolEmail);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/school-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message ?? "Failed to send code");
        return;
      }
      setStage("code");
      setDemoCode(typeof data.demoCode === "string" ? data.demoCode : "");
      setNotice(data.message);
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/school-email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message ?? "Failed to verify");
        return;
      }
      setStage("idle");
      setCode("");
      setEmail("");
      setNotice("");
      setDemoCode("");
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            School email verification
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Required to join educational communities. One account per verified
            student email. Teachers never see this address in the member list.
          </p>
        </div>
        {verified ? (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            Verified · {schoolDomain}
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            Not verified
          </span>
        )}
      </div>

      {verified && (
        <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-200">
          Verified as{" "}
          <span className="font-semibold">{schoolEmail}</span>. You can now see
          and join educational communities for {schoolDomain}.
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
          {notice}
          {demoCode && (
            <span className="ml-1 font-mono font-bold">
              Demo code: {demoCode}
            </span>
          )}
        </p>
      )}

      <form className="mt-4 space-y-3" onSubmit={stage === "idle" ? sendCode : verify}>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="email"
            required
            disabled={stage === "code"}
            placeholder={
              verified
                ? "Replace with another @college.edu.in address"
                : "you@college.edu.in"
            }
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
          />
          {stage === "idle" ? (
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Sending..." : "Send code"}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setStage("idle");
                setCode("");
                setDemoCode("");
              }}
              className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Change email
            </button>
          )}
        </div>

        {stage === "code" && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              required
              inputMode="numeric"
              placeholder="5-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
              className="w-40 rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-center font-mono text-sm tracking-widest text-zinc-900 outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
            >
              {busy ? "Verifying..." : "Verify school email"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
