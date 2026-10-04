"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Shown when a page fails to load (a server or data error). Replaces Next.js's default screen.
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    console.error(error);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a browser-only value once
    setOffline(!navigator.onLine);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12 text-center">
      <p className="text-5xl">{offline ? "📡" : "🥀"}</p>
      <h1 className="mt-4 text-xl font-semibold">{offline ? "You're offline" : "This page didn't load"}</h1>
      <p className="mt-2 text-muted">
        {offline ? "Check your internet connection and try again." : "Please try again in a moment."}
      </p>
      <button onClick={reset} className="mt-8 w-full rounded-full bg-leaf py-3 font-medium text-background">
        Try again
      </button>
      <Link href="/" className="mt-3 py-2 text-sm text-muted">
        Go to Today
      </Link>
      {error.digest && <p className="mt-6 text-xs text-muted">Error reference: {error.digest}</p>}
    </main>
  );
}
