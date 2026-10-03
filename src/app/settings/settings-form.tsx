"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LocationCard } from "./location-card";
import { createClient } from "@/lib/supabase/client";

const HOURS = Array.from({ length: 17 }, (_, i) => `${String(i + 6).padStart(2, "0")}:00`); // 06:00–22:00

export function SettingsForm(props: {
  digestTime: string;
  hemisphere: "north" | "south";
  locationName: string | null;
  displayName: string;
  timezone: string;
  email: string | null;
}) {
  const router = useRouter();
  const [digestTime, setDigestTime] = useState(props.digestTime);
  const [saved, setSaved] = useState<string | null>(null);
  const [name, setName] = useState(props.displayName);

  async function save(update: { digestTime?: string; displayName?: string }) {
    setSaved(null);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    setSaved(res.ok ? "Saved" : "Couldn't save. Please try again.");
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  const times = HOURS.includes(digestTime) ? HOURS : [digestTime, ...HOURS];

  return (
    <div className="mt-6 space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) save({ displayName: name.trim() });
        }}
        className="rounded-2xl border border-border bg-surface p-4 text-sm"
      >
        <label htmlFor="name" className="font-semibold">
          Your name
        </label>
        <p className="mt-1 text-muted">Shown to your household and plant-sitters.</p>
        <div className="mt-3 flex gap-2">
          <input
            id="name"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-leaf"
          />
          <button disabled={!name.trim() || name.trim() === props.displayName} className="rounded-xl bg-leaf px-4 font-medium text-background disabled:opacity-40">
            Save
          </button>
        </div>
      </form>

      <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
        <label htmlFor="digest" className="font-semibold">
          Reminder time
        </label>
        <p className="mt-1 text-muted">When should the daily watering message arrive? ({props.timezone.replace(/_/g, " ")} time)</p>
        <select
          id="digest"
          value={digestTime}
          onChange={(e) => {
            setDigestTime(e.target.value);
            save({ digestTime: e.target.value });
          }}
          className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-base"
        >
          {times.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <LocationCard initialName={props.locationName} />

      {saved && (
        <p role="status" className="text-sm text-muted">
          {saved}
        </p>
      )}

      <div className="border-t border-border pt-6 text-sm">
        {props.email && <p className="text-muted">Signed in as {props.email}</p>}
        <button onClick={signOut} className="mt-2 font-medium text-bad">
          Sign out
        </button>
      </div>
    </div>
  );
}
