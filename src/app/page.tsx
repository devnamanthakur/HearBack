import Link from "next/link";
import { auth } from "@/lib/auth";
import SignOutButton from "@/components/SignOutButton";

const features = [
  {
    title: "Anonymous classroom communities",
    description:
      "Professors create private groups with an invite code. Students join with a hidden nickname and ask doubts without fear.",
  },
  {
    title: "Free AI help",
    description:
      "Fix your English or translate to English while typing, and auto-generate a post description from lecture notes.",
  },
  {
    title: "Notes, images & same-doubt",
    description:
      "Professors attach notes and images; students reply with photos and tap 'same doubt' instead of judging each other.",
  },
];

export default async function Home() {
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-100 dark:bg-zinc-900">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-lg font-black text-white shadow-lg">
            H
          </div>
          <span className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
            Hearback
          </span>
        </div>
        <nav className="flex items-center gap-3">
          {signedIn ? (
            <>
              <Link
                href="/dashboard"
                className="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Dashboard
              </Link>
              <SignOutButton className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700">
                Sign out
              </SignOutButton>
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:opacity-90"
              >
                Get started
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <span className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-4 py-1.5 text-xs font-medium text-zinc-600 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Anonymous feedback, communities &amp; classrooms
        </span>

        <h1 className="max-w-3xl text-4xl font-black tracking-tight text-zinc-900 sm:text-6xl dark:text-white">
          Ask questions.{" "}
          <span className="text-indigo-600">
            Stay anonymous.
          </span>
        </h1>

        <p className="mt-6 max-w-xl text-base text-zinc-500 sm:text-lg dark:text-zinc-400">
          Hearback lets classrooms and communities have honest, anonymous
          discussions — students ask and share without social fear, and
          professors answer without the awkwardness.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          {signedIn ? (
            <>
              <Link
                href="/dashboard"
                className="rounded-xl bg-indigo-600 px-7 py-3.5 text-sm font-semibold text-white shadow-xl shadow-indigo-500/25 transition hover:opacity-90 active:scale-[0.99]"
              >
                Go to dashboard
              </Link>
              <SignOutButton className="rounded-xl border border-zinc-300 bg-white px-7 py-3.5 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800">
                Sign out
              </SignOutButton>
            </>
          ) : (
            <>
              <Link
                href="/sign-up"
                className="rounded-xl bg-indigo-600 px-7 py-3.5 text-sm font-semibold text-white shadow-xl shadow-indigo-500/25 transition hover:opacity-90 active:scale-[0.99]"
              >
                Create your profile
              </Link>
              <Link
                href="/sign-in"
                className="rounded-xl border border-zinc-300 bg-white px-7 py-3.5 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Sign in
              </Link>
            </>
          )}
        </div>

        <div className="mt-20 grid w-full gap-6 text-left sm:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-zinc-200 bg-white/70 p-6 backdrop-blur dark:border-white/10 dark:bg-zinc-900/70"
            >
              <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-zinc-200 py-6 dark:border-zinc-800">
        <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
          Hearback — built for candid, anonymous connections.
        </p>
      </footer>
    </div>
  );
}