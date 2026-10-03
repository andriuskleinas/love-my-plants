"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SYMPTOMS } from "@/lib/care/rescue";
import { compressImage } from "@/lib/image/compress";
import { createClient } from "@/lib/supabase/client";

type Kind = "whole" | "triage" | "soil";
type Shot = { blob: Blob; url: string };

const SLOTS: { kind: Kind; title: string; hint: string; required?: boolean }[] = [
  { kind: "whole", title: "Whole plant", hint: "Plant and pot", required: true },
  { kind: "triage", title: "The problem", hint: "Close-up, leaf undersides too" },
  { kind: "soil", title: "Stem base & soil", hint: "Where stem meets soil" },
];

/** Plant ER triage: symptoms, what happened, and targeted photos → diagnosis + rescue plan. */
export function TriageFlow({ plantId, homeId, nickname }: { plantId: string; homeId: string; nickname: string }) {
  const router = useRouter();
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [shots, setShots] = useState<Partial<Record<Kind, Shot>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const toggle = (s: string) => setSymptoms((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  async function pick(kind: Kind, file: File | undefined) {
    if (!file) return;
    const blob = await compressImage(file);
    setShots((prev) => ({ ...prev, [kind]: { blob, url: URL.createObjectURL(blob) } }));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      const supabase = createClient();
      const uploaded = await Promise.all(
        (Object.entries(shots) as [Kind, Shot][]).map(async ([kind, shot]) => {
          const path = `${homeId}/${plantId}/${crypto.randomUUID()}.jpg`;
          const { error: upErr } = await supabase.storage.from("plant-photos").upload(path, shot.blob, { contentType: "image/jpeg" });
          if (upErr) throw new Error("Uploading a photo failed. Check your connection and try again.");
          return { path, kind };
        }),
      );
      const res = await fetch(`/api/plants/${plantId}/assess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: uploaded, emergency: true, symptoms, note: note.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (json.retake) {
        setHint(json.retake);
        setBusy(false);
        return;
      }
      router.refresh(); // the page now shows the rescue plan
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  if (busy) {
    return (
      <section className="mt-24 text-center" aria-live="polite">
        <p className="animate-pulse text-6xl">🩺</p>
        <p className="mt-6 text-xl font-semibold">Examining {nickname}…</p>
        <p className="mt-2 text-sm text-muted">Working out what&apos;s wrong and how to fix it. Usually under a minute.</p>
      </section>
    );
  }

  return (
    <>
      <h1 className="mt-3 text-2xl font-semibold">🚨 What&apos;s wrong with {nickname}?</h1>
      <p className="mt-1 text-muted">Tell us what you see, add a few photos, and we&apos;ll make a rescue plan.</p>
      {error && <p role="alert" className="mt-3 rounded-2xl bg-bad/10 p-3 text-sm text-bad">{error}</p>}
      {hint && <p role="status" className="mt-3 rounded-2xl bg-warn/15 p-3 text-sm">📷 {hint}</p>}

      <fieldset className="mt-6">
        <legend className="font-medium">What do you notice? (tap all that apply)</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {SYMPTOMS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={symptoms.includes(s)}
              onClick={() => toggle(s)}
              className={`rounded-full border px-3 py-2 text-sm ${symptoms.includes(s) ? "border-leaf bg-leaf-soft" : "border-border bg-surface"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </fieldset>

      <label htmlFor="note" className="mt-6 block font-medium">
        What happened? <span className="font-normal text-muted">(optional)</span>
      </label>
      <textarea
        id="note"
        value={note}
        maxLength={300}
        rows={2}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. forgot to water for two weeks, moved it to a new window…"
        className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-leaf"
      />

      <p className="mt-6 font-medium">Photos</p>
      <div className="mt-2 grid grid-cols-3 gap-3">
        {SLOTS.map((slot) => {
          const shot = shots[slot.kind];
          return (
            <label key={slot.kind} className="flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-surface">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  pick(slot.kind, e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <div className="flex aspect-[3/4] items-center justify-center bg-leaf-soft text-3xl">
                {shot ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                  <img src={shot.url} alt={`${slot.title} photo`} className="h-full w-full object-cover" />
                ) : (
                  <span aria-hidden>📷</span>
                )}
              </div>
              <div className="p-2">
                <p className="text-sm font-medium">
                  {slot.title}
                  {slot.required && <span className="text-terracotta"> *</span>}
                </p>
                <p className="text-xs text-muted">{shot ? "Tap to retake" : slot.hint}</p>
              </div>
            </label>
          );
        })}
      </div>

      <button
        disabled={!shots.whole}
        onClick={submit}
        className="mt-8 w-full rounded-full bg-leaf py-3 font-medium text-background disabled:opacity-40"
      >
        Make a rescue plan
      </button>
      <p className="mt-3 text-center text-xs text-muted">Uses one plant check from your daily limit.</p>
    </>
  );
}
