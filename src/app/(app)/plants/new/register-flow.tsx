"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ReportCard } from "@/components/report-card";
import type { Assessment } from "@/lib/ai/schemas";
import {
  combineWindowSides,
  windowDirectionName,
  type CardinalDirection,
  type WindowDirection,
} from "@/lib/care/watering";
import { callApi } from "@/lib/api-client";
import { readPhoto, uploadPlantPhoto } from "@/lib/image/upload";
import { createClient } from "@/lib/supabase/client";

type Kind = "whole" | "soil" | "spot";
type Shot = { blob: Blob; url: string };
type Step = "photos" | "questions" | "checking" | "result";

const SLOTS: { kind: Kind; title: string; hint: string; required?: boolean }[] = [
  { kind: "whole", title: "Whole plant", hint: "Plant and pot fully in frame", required: true },
  { kind: "soil", title: "Soil close-up", hint: "Top of the soil, up close" },
  { kind: "spot", title: "Its spot", hint: "Where it stands, window included" },
];

const POT_SIZES = [
  { label: "Small", sub: "~12 cm", cm: 12 },
  { label: "Medium", sub: "~17 cm", cm: 17 },
  { label: "Large", sub: "~24 cm", cm: 24 },
  { label: "Extra large", sub: "30 cm+", cm: 32 },
];
const MATERIALS = [
  { label: "Plastic", value: "plastic" },
  { label: "Ceramic", value: "ceramic" },
  { label: "Terracotta", value: "terracotta" },
] as const;
const SIDES: { label: string; value: CardinalDirection }[] = [
  { label: "North", value: "N" },
  { label: "East", value: "E" },
  { label: "South", value: "S" },
  { label: "West", value: "W" },
];

const CHECKING_MESSAGES = [
  "Looking at the leaves…",
  "Checking the soil…",
  "Judging the light…",
  "Sizing up the pot…",
  "Writing your care steps…",
];

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
        selected ? "border-leaf bg-leaf-soft" : "border-border bg-surface"
      }`}
    >
      {children}
    </button>
  );
}

export function RegisterFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("photos");
  const [shots, setShots] = useState<Partial<Record<Kind, Shot>>>({});
  const [potCm, setPotCm] = useState<number | null>(null);
  const [material, setMaterial] = useState<(typeof MATERIALS)[number]["value"]>("plastic");
  const [drainage, setDrainage] = useState<boolean | null>(null);
  // Up to two neighbouring sides (S + W = south-west), or "none" for no window.
  const [sides, setSides] = useState<CardinalDirection[] | "none" | null>(null);
  const windowDir: WindowDirection | null = sides === null ? null : sides === "none" ? "none" : combineWindowSides(sides);
  const [plant, setPlant] = useState<{ id: string; homeId: string } | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [species, setSpecies] = useState<string>("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [retakeHint, setRetakeHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msgIndex, setMsgIndex] = useState(0);
  const shotsRef = useRef(shots);
  useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);

  // Release preview URLs when leaving the page.
  useEffect(() => () => Object.values(shotsRef.current).forEach((s) => s && URL.revokeObjectURL(s.url)), []);

  useEffect(() => {
    if (step !== "checking") return;
    const t = setInterval(() => setMsgIndex((i) => (i + 1) % CHECKING_MESSAGES.length), 2500);
    return () => clearInterval(t);
  }, [step]);

  async function onPick(kind: Kind, file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const blob = await readPhoto(file);
      setShots((prev) => {
        if (prev[kind]) URL.revokeObjectURL(prev[kind]!.url);
        return { ...prev, [kind]: { blob, url: URL.createObjectURL(blob) } };
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function toggleSide(side: CardinalDirection) {
    setSides((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      if (current.includes(side)) {
        const next = current.filter((s) => s !== side);
        return next.length ? next : null;
      }
      // Keep the last tap, plus the previous one if it's a neighbouring side.
      const last = current.at(-1);
      const combined = last ? combineWindowSides([last, side]) : side;
      return combined.length === 2 ? [last!, side] : [side];
    });
  }

  async function runCheck() {
    if (potCm == null || drainage == null || windowDir == null) return;
    setStep("checking");
    setError(null);
    setRetakeHint(null);
    try {
      let current = plant;
      if (!current) {
        const created = await callApi<{ id: string; homeId: string }>("/api/plants", {
          method: "POST",
          json: { potDiameterCm: potCm, potMaterial: material, hasDrainage: drainage, windowDirection: windowDir },
        });
        if (!created.ok) throw new Error(created.error);
        current = created.data;
        setPlant(current);
      }

      const supabase = createClient();
      const uploaded = await Promise.all(
        (Object.entries(shots) as [Kind, Shot][]).map(async ([kind, shot]) => {
          const path = `${current!.homeId}/${current!.id}/${crypto.randomUUID()}.jpg`;
          await uploadPlantPhoto(supabase, path, shot.blob);
          return { path, kind };
        }),
      );

      const checked = await callApi<{ retake?: string; assessment: Assessment }>(`/api/plants/${current.id}/assess`, {
        method: "POST",
        json: { photos: uploaded },
      });
      if (!checked.ok) throw new Error(checked.error);
      const json = checked.data;
      if (json.retake) {
        setRetakeHint(json.retake);
        setStep("photos");
        return;
      }
      const result = json.assessment as Assessment;
      setAssessment(result);
      setSpecies(result.species[0]?.name ?? "");
      setNickname(result.suggestedNickname ?? result.species[0]?.commonName ?? "My plant");
      setStep("result");
    } catch (e) {
      setError((e as Error).message);
      setStep("questions");
    }
  }

  async function save() {
    if (!plant) return;
    setBusy(true);
    setError(null);
    const res = await callApi(`/api/plants/${plant.id}`, {
      method: "PATCH",
      json: { nickname: nickname.trim() || "My plant", speciesName: species || undefined },
    });
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    router.push(`/plants/${plant.id}`);
    router.refresh();
  }

  const primary = "w-full rounded-full bg-leaf py-3 font-medium text-background disabled:opacity-40";

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-12 pt-6">
      <Link href="/" className="text-sm text-muted">
        ← Cancel
      </Link>

      {error && (
        <p role="alert" className="mt-4 rounded-2xl bg-bad/10 p-3 text-sm text-bad">
          {error}
        </p>
      )}

      {step === "photos" && (
        <>
          <h1 className="mt-4 text-2xl font-semibold">Snap your plant</h1>
          <p className="mt-1 text-muted">One photo is enough. A soil close-up makes the check more accurate.</p>
          {retakeHint && (
            <p role="status" className="mt-4 rounded-2xl bg-warn/15 p-3 text-sm">
              📷 {retakeHint}
            </p>
          )}
          <div className="mt-6 grid grid-cols-3 gap-3">
            {SLOTS.map((slot) => {
              const shot = shots[slot.kind];
              return (
                <label
                  key={slot.kind}
                  className="flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-surface"
                >
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={(e) => {
                      onPick(slot.kind, e.target.files?.[0]);
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
          <button className={`${primary} mt-8`} disabled={!shots.whole} onClick={() => setStep("questions")}>
            Next
          </button>
        </>
      )}

      {step === "questions" && (
        <>
          <h1 className="mt-4 text-2xl font-semibold">Three quick questions</h1>

          <fieldset className="mt-6">
            <legend className="font-medium">How big is the pot?</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {POT_SIZES.map((p) => (
                <Chip key={p.cm} selected={potCm === p.cm} onClick={() => setPotCm(p.cm)}>
                  <span className="block font-medium">{p.label}</span>
                  <span className="text-sm text-muted">{p.sub} across</span>
                </Chip>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {MATERIALS.map((m) => (
                <Chip key={m.value} selected={material === m.value} onClick={() => setMaterial(m.value)}>
                  <span className="text-sm">{m.label}</span>
                </Chip>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-6">
            <legend className="font-medium">Does the pot have a drainage hole?</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Chip selected={drainage === true} onClick={() => setDrainage(true)}>
                Yes
              </Chip>
              <Chip selected={drainage === false} onClick={() => setDrainage(false)}>
                No / not sure
              </Chip>
            </div>
          </fieldset>

          <fieldset className="mt-6">
            <legend className="font-medium">Which way does the nearest window face?</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {SIDES.map((w) => {
                const selected = Array.isArray(sides) && sides.includes(w.value);
                return (
                  <Chip key={w.value} selected={selected} onClick={() => toggleSide(w.value)}>
                    {w.label}
                  </Chip>
                );
              })}
              <Chip selected={sides === "none"} onClick={() => setSides("none")}>
                No window
              </Chip>
            </div>
            <p className="mt-2 text-xs text-muted">
              {windowDir && windowDir !== "none" ? (
                <>
                  Got it: a <b className="text-foreground">{windowDirectionName(windowDir)}</b>-facing window.
                  {windowDir.length === 1 && " Facing in between? Tap a second side too."}
                </>
              ) : (
                <>Facing in between? Tap two sides, e.g. South + West. Not sure? The midday sun comes from the south (northern hemisphere).</>
              )}
            </p>
          </fieldset>

          <button
            className={`${primary} mt-8`}
            disabled={potCm == null || drainage == null || windowDir == null}
            onClick={runCheck}
          >
            Check my plant
          </button>
          <button className="mt-3 w-full py-2 text-sm text-muted" onClick={() => setStep("photos")}>
            Back to photos
          </button>
        </>
      )}

      {step === "checking" && (
        <section className="mt-24 text-center" aria-live="polite">
          <p className="animate-pulse text-6xl">🌿</p>
          <h1 className="mt-6 text-xl font-semibold">Checking your plant</h1>
          <p className="mt-2 text-muted">{CHECKING_MESSAGES[msgIndex]}</p>
          <p className="mt-6 text-xs text-muted">This usually takes under a minute.</p>
        </section>
      )}

      {step === "result" && assessment && (
        <>
          <h1 className="mt-4 text-2xl font-semibold">Meet your plant</h1>

          {assessment.species.length > 0 && (
            <fieldset className="mt-4">
              <legend className="text-sm text-muted">We think it&apos;s a… (tap to correct)</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {assessment.species.map((s) => (
                  <Chip key={s.name} selected={species === s.name} onClick={() => setSpecies(s.name)}>
                    <span className="block text-sm font-medium">{s.commonName}</span>
                    <span className="text-xs italic text-muted">
                      {s.name} · {Math.round(s.confidence * 100)}%
                    </span>
                  </Chip>
                ))}
              </div>
            </fieldset>
          )}

          <label htmlFor="nickname" className="mt-6 block text-sm text-muted">
            Its name
          </label>
          <input
            id="nickname"
            value={nickname}
            maxLength={40}
            onChange={(e) => setNickname(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-3 text-lg font-semibold outline-none focus:border-leaf"
          />

          <div className="mt-8">
            <ReportCard scores={assessment.scores} issues={assessment.issues} actions={assessment.actions} />
          </div>

          <button className={`${primary} mt-8`} disabled={busy} onClick={save}>
            {busy ? "Saving…" : `Save ${nickname.trim() || "my plant"}`}
          </button>
        </>
      )}
    </main>
  );
}
