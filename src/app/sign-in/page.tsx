import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import SignInForm from "@/components/SignInForm";

export const metadata: Metadata = {
  title: "Sign in | Hearback",
};

export default async function SignInPage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return <SignInForm />;
}