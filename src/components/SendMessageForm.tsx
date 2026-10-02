"use client";

import { useState } from "react";
import { messageSchema } from "@/schema/MessageSchema";

export default function SendMessageForm({
  username,
}: {
  username: string;
}) {
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const parsed = messageSchema.safeParse({ content });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(", "));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, content }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message ?? "Could not send your message.");
        return;
      }

      setContent("");
      setSuccess(
        `Your message has been sent to ${username} anonymously. Thank you!`,
      );
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-zinc-900"
      onSubmit={handleSubmit}
    >
      <label
        htmlFor="message"
        className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        Send an anonymous message
      </label>
      <textarea
        id="message"
        rows={4}
        maxLength={500}
        placeholder="Say something honest..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
      />

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      {success && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          {success}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Sending..." : "Send anonymously"}
      </button>
    </form>
  );
}