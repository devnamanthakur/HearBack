import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import SignUpForm from "@/components/SignUpForm";

export const metadata: Metadata = {
  title: "Sign up | Hearback",
};

export default async function SignUpPage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return <SignUpForm />;
}