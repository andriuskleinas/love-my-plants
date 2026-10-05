import { Bone } from "@/components/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-12 pt-[max(1rem,env(safe-area-inset-top))] sm:max-w-2xl lg:max-w-4xl" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <Bone className="h-8 w-32 rounded-xl" />
      <Bone className="mt-6 h-9 w-72 rounded-full" />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Bone key={i} className="aspect-[4/5]" />
        ))}
      </div>
    </main>
  );
}
