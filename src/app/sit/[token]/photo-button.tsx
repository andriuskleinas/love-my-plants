"use client";

import { callApi } from "@/lib/api-client";
import { useState } from "react";
import { readPhoto } from "@/lib/image/upload";

export function SitterPhotoButton({ token, plantId, nickname }: { token: string; plantId: string; nickname: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function send(file: File | undefined) {
    if (!file) return;
    setState("sending");
    setError(null);
    try {
      const form = new FormData();
      form.set("plantId", plantId);
      form.set("photo", new File([await readPhoto(file)], "photo.jpg", { type: "image/jpeg" }));
      const res = await callApi(`/api/sit/${token}/photo`, { method: "POST", body: form });
      if (res.ok) return setState("sent");
      setError(res.error);
      setState("error");
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  }

  return (
    <label className="mt-3 block cursor-pointer rounded-xl border border-border px-3 py-2 text-center text-sm">
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          send(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {state === "sending" && "Sending…"}
      {state === "sent" && "✓ Photo sent. Thank you!"}
      {state === "error" && "Tap to try again"}
      {state === "idle" && `📷 Send a photo of ${nickname}`}
      {error && <span className="mt-1 block text-bad">{error}</span>}
    </label>
  );
}
