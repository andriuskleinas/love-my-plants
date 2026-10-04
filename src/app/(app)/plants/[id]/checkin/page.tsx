import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PHOTO_BUCKET } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";
import { CheckinFlow } from "./checkin-flow";

export const metadata: Metadata = { title: "Weekly check-in · Love My Plants" };

export default async function CheckinPage({ params }: PageProps<"/plants/[id]/checkin">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: plant } = await supabase.from("plants").select("id, home_id, nickname").eq("id", id).maybeSingle();
  if (!plant) notFound();

  // Last whole-plant photo, shown faintly over the camera to line up the same angle.
  const { data: last } = await supabase
    .from("photos")
    .select("storage_path")
    .eq("plant_id", id)
    .in("kind", ["whole", "checkin"])
    .order("taken_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ghostUrl = last
    ? ((await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(last.storage_path, 3600)).data?.signedUrl ?? null)
    : null;

  return <CheckinFlow plantId={plant.id} homeId={plant.home_id} nickname={plant.nickname} ghostUrl={ghostUrl} />;
}
