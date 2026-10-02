"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className={className}
    >
      {children ?? "Sign out"}
    </button>
  );
}
