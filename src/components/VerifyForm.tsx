"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { verifySchema } from "@/schema/verifySchema";

export default function VerifyForm({ username }: { username: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoOtp, setDemoOtp] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/demo-code?username=${encodeURIComponent(username)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.success && data?.otp) {
          setDemoOtp(data.otp);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const parsed = verifySchema.safeParse({ code });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(", "));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, code }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message ?? "Could not verify your account.");
        return;
      }

      router.push("/sign-in");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 py-10 dark:bg-zinc-900">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl dark:border-white/10 dark:bg-zinc-900">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-2xl font-black text-white shadow-lg">
              H
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Verify your email
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              We sent a 5-digit code to your email. Enter it below.
            </p>
          </div>

          {demoOtp && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
              <span className="font-semibold">Demo mode:</span> your
              verification code is{" "}
              <span className="font-mono text-base font-bold tracking-widest">
                {demoOtp}
              </span>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="code"
                className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Verification code
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="•••••"
                maxLength={5}
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 5))
                }
                className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-center text-lg tracking-[0.6em] text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Verifying..." : "Verify account"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
            Didn&apos;t receive the code? The code expires after 1 hour.{" "}
            <Link
              href="/sign-up"
              className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
            >
              Re-register to resend
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}