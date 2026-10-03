"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const HOURS = Array.from({ length: 17 }, (_, i) => `${String(i + 6).padStart(2, "0")}:00`); // 06:00–22:00

export function SettingsForm(props: {
  digestTime: string;
  hemisphere: "north" | "south";
  timezone: string;
  email: string | null;
}) {
  const router = useRouter();
  const [digestTime, setDigestTime] = useState(props.digestTime);
  const [hemisphere, setHemisphere] = useState(props.hemisphere);
  const [saved, setSaved] = useState<string | null>(null);

  async function save(update: { digestTime?: string; hemisphere?: string }) {
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

      <fieldset className="rounded-2xl border border-border bg-surface p-4 text-sm">
        <legend className="sr-only">Hemisphere</legend>
        <p className="font-semibold">Where do you live?</p>
        <p className="mt-1 text-muted">Seasons change how often plants need water.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(["north", "south"] as const).map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={hemisphere === h}
              onClick={() => {
                setHemisphere(h);
                save({ hemisphere: h });
              }}
              className={`rounded-xl border px-3 py-2.5 ${hemisphere === h ? "border-leaf bg-leaf-soft" : "border-border"}`}
            >
              {h === "north" ? "Northern hemisphere" : "Southern hemisphere"}
            </button>
          ))}
        </div>
      </fieldset>

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
