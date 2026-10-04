import { Bone } from "@/components/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 pb-12" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <Bone className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-3 px-4 pt-5">
        <Bone className="h-8 w-48 rounded-xl" />
        <Bone className="h-4 w-32 rounded-lg" />
        <Bone className="mt-4 h-14" />
        <Bone className="h-40" />
      </div>
    </main>
  );
}
