"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { MESSAGES } from "@/lib/errors";
import { compressImage } from "./compress";

/** Shrinks a chosen photo; throws a clear message when the browser can't open it (e.g. HEIC). */
export async function readPhoto(file: Blob): Promise<Blob> {
  try {
    return await compressImage(file);
  } catch {
    throw new Error(MESSAGES.photoUnreadable);
  }
}

/** Uploads a plant photo to private storage with a clear message for each failure. */
export async function uploadPlantPhoto(supabase: SupabaseClient, path: string, blob: Blob): Promise<void> {
  let error: { message?: string; statusCode?: string | number } | null = null;
  try {
    ({ error } = await supabase.storage.from("plant-photos").upload(path, blob, { contentType: "image/jpeg" }));
  } catch {
    throw new Error(MESSAGES.offline);
  }
  if (!error) return;
  const status = Number((error as { statusCode?: string | number }).statusCode ?? 0);
  if (!navigator.onLine) throw new Error(MESSAGES.offline);
  if (status === 413 || /too large|maximum allowed size/i.test(error.message ?? "")) {
    throw new Error("The photo is too large. Take a new photo with the camera.");
  }
  if (status === 401 || status === 403 || /jwt|unauthorized|row-level/i.test(error.message ?? "")) {
    throw new Error("The photo wasn't saved. Sign in again and retry.");
  }
  throw new Error(MESSAGES.uploadFailed);
}
