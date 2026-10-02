import type { Metadata } from "next";
import VerifyForm from "@/components/VerifyForm";

export const metadata: Metadata = {
  title: "Verify your email | Hearback",
};

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return <VerifyForm username={username} />;
}