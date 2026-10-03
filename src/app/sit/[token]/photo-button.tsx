"use client";

import { useState } from "react";
import { compressImage } from "@/lib/image/compress";

export function SitterPhotoButton({ token, plantId, nickname }: { token: string; plantId: string; nickname: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function send(file: File | undefined) {
    if (!file) return;
    setState("sending");
    try {
      const form = new FormData();
      form.set("plantId", plantId);
      form.set("photo", new File([await compressImage(file)], "photo.jpg", { type: "image/jpeg" }));
      const res = await fetch(`/api/sit/${token}/photo`, { method: "POST", body: form });
      setState(res.ok ? "sent" : "error");
    } catch {
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
      {state === "error" && "Couldn't send. Tap to try again"}
      {state === "idle" && `📷 Send a photo of ${nickname}`}
    </label>
  );
}
