import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12 text-center">
      <p className="text-5xl">🔍</p>
      <h1 className="mt-4 text-xl font-semibold">Page not found</h1>
      <p className="mt-2 text-muted">
        This page doesn&apos;t exist. The link may be wrong, or the plant was deleted or isn&apos;t shared with you.
      </p>
      <Link href="/" className="mt-8 w-full rounded-full bg-leaf py-3 font-medium text-background">
        Go to Today
      </Link>
    </main>
  );
}
