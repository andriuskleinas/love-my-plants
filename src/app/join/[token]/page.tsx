import type { Metadata } from "next";
import { JoinButton } from "./join-button";

export const metadata: Metadata = { title: "Join · Love My Plants", robots: { index: false }, referrer: "no-referrer" };

// Reached after sign-in (the proxy sends signed-out visitors to /login first).
export default async function JoinPage({ params }: PageProps<"/join/[token]">) {
  const { token } = await params;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12 text-center">
      <p className="text-5xl">🏠🪴</p>
      <h1 className="mt-4 text-2xl font-semibold">Join a Care Circle</h1>
      <p className="mt-2 text-muted">You&apos;ll share the plants, their reminders and their history. Whoever waters taps Done.</p>
      <JoinButton token={token} />
    </main>
  );
}
