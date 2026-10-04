import { PageSkeleton } from "@/components/skeleton";

export default function Loading() {
  return <PageSkeleton cards={4} cardClass="h-[5.5rem]" />;
}
