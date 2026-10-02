"use client";

import { useState } from "react";
import { generateNickname, isValidNickname } from "@/lib/nicknames";

export default function NicknamePicker({
  onChange,
  label,
  hint,
}: {
  onChange: (nickname: string) => void;
  label?: string;
  hint?: string;
}) {
  const [nickname, setNickname] = useState(generateNickname());
  const [manual, setManual] = useState(false);

  const update = (value: string) => {
    setNickname(value);
    onChange(value);
  };

  const shuffle = () => {
    setManual(false);
    update(generateNickname());
  };

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label ?? "Your anonymous name"}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={nickname}
          onChange={(e) => {
            setManual(true);
            update(e.target.value);
          }}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
        />
        <button
          type="button"
          onClick={shuffle}
          className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          title="Shuffle a random nickname"
        >
          Shuffle
        </button>
      </div>
      <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        {hint ??
          "This is how you appear to everyone in this community. Your real identity stays hidden — even from the professor."}
      </p>
      {!isValidNickname(nickname) && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
          2–24 characters: letters, numbers, spaces, _ and - only.
        </p>
      )}
      {!manual && (
        <p className="mt-1 text-xs text-indigo-500 dark:text-indigo-400">
          Auto-generated — shuffle if you want a different one.
        </p>
      )}
    </div>
  );
}