"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ReportCard } from "@/components/report-card";
import { SCORE_KEYS, SCORE_LABELS, type Assessment } from "@/lib/ai/schemas";
import { compressImage } from "@/lib/image/compress";
import { createClient } from "@/lib/supabase/client";

type Step = "camera" | "review" | "checking" | "result";
type Previous = { health: number; scores: Record<string, { value: number }>; date: string } | null;

const ASPECT = 3 / 4; // width / height of the viewfinder and saved photo

export function CheckinFlow({
  plantId,
  homeId,
  nickname,
  ghostUrl,
}: {
  plantId: string;
  homeId: string;
  nickname: string;
  ghostUrl: string | null;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [step, setStep] = useState<Step>("camera");
  const [cameraOk, setCameraOk] = useState<boolean | null>(null);
  const [ghost, setGhost] = useState(0.35);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [closeUp, setCloseUp] = useState<{ blob: Blob; url: string } | null>(null);
  const [result, setResult] = useState<{ assessment: Assessment; previous: Previous; rescuePlanId: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return setCameraOk(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOk(true);
    } catch {
      setCameraOk(false);
    }
  }, []);

  useEffect(() => {
    // Camera access needs a user-visible page; start once mounted, stop on leave.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- starting a browser API, not deriving state
    if (step === "camera") startCamera();
    return stopCamera;
  }, [step, startCamera, stopCamera]);

  function capture() {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    // Crop the centre to the viewfinder's 3:4 so the photo matches what was lined up.
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const sw = vw / vh > ASPECT ? vh * ASPECT : vw;
    const sh = vw / vh > ASPECT ? vh : vw / ASPECT;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
    canvas.getContext("2d")!.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, sw, sh);
    canvas.toBlob(async (b) => {
      if (!b) return;
      const blob = await compressImage(b);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
      stopCamera();
      setStep("review");
    }, "image/jpeg", 0.9);
  }

  async function fromFile(file: File | undefined, target: "photo" | "closeUp") {
    if (!file) return;
    const blob = await compressImage(file);
    const value = { blob, url: URL.createObjectURL(blob) };
    if (target === "photo") {
      setPhoto(value);
      stopCamera();
      setStep("review");
    } else setCloseUp(value);
  }

  async function submit() {
    if (!photo) return;
    setStep("checking");
    setError(null);
    setHint(null);
    try {
      const supabase = createClient();
      const shots = [{ blob: photo.blob, kind: "checkin" as const }, ...(closeUp ? [{ blob: closeUp.blob, kind: "triage" as const }] : [])];
      const uploaded = await Promise.all(
        shots.map(async (s) => {
          const path = `${homeId}/${plantId}/${crypto.randomUUID()}.jpg`;
          const { error: upErr } = await supabase.storage.from("plant-photos").upload(path, s.blob, { contentType: "image/jpeg" });
          if (upErr) throw new Error("Uploading the photo failed. Check your connection and try again.");
          return { path, kind: s.kind };
        }),
      );
      const res = await fetch(`/api/plants/${plantId}/assess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: uploaded }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (json.retake) {
        setHint(json.retake);
        setPhoto(null);
        setStep("camera");
        return;
      }
      setResult({ assessment: json.assessment, previous: json.previous, rescuePlanId: json.rescuePlanId ?? null });
      setStep("result");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");
      setStep("review");
    }
  }

  const primary = "w-full rounded-full bg-leaf py-3 font-medium text-background disabled:opacity-40";

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-12 pt-6">
      <Link href={`/plants/${plantId}`} className="text-sm text-muted">
        ← {nickname}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">Weekly check-in</h1>
      {error && (
        <p role="alert" className="mt-3 rounded-2xl bg-bad/10 p-3 text-sm text-bad">
          {error}
        </p>
      )}
      {hint && (
        <p role="status" className="mt-3 rounded-2xl bg-warn/15 p-3 text-sm">
          📷 {hint}
        </p>
      )}

      {step === "camera" && (
        <>
          <p className="mt-1 text-muted">
            {ghostUrl ? "Line the plant up with last week's photo, then snap." : "Fit the whole plant and pot in the frame."}
          </p>
          <div className="relative mt-4 aspect-[3/4] overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
            {ghostUrl && cameraOk && (
              // eslint-disable-next-line @next/next/no-img-element -- signed URL, ghost overlay
              <img src={ghostUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={{ opacity: ghost }} />
            )}
            {cameraOk === false && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white">
                <p>The live camera isn&apos;t available here.</p>
                <p className="text-white/70">Use the button below to take or choose a photo.</p>
              </div>
            )}
          </div>
          {ghostUrl && cameraOk && (
            <label className="mt-3 flex items-center gap-3 text-sm text-muted">
              Last week
              <input
                type="range"
                min={0}
                max={0.7}
                step={0.05}
                value={ghost}
                onChange={(e) => setGhost(Number(e.target.value))}
                className="flex-1 accent-[var(--leaf)]"
                aria-label="How visible last week's photo is"
              />
            </label>
          )}
          {cameraOk && (
            <button onClick={capture} className={`${primary} mt-4`}>
              📸 Snap
            </button>
          )}
          <label className={`mt-3 block cursor-pointer text-center text-sm ${cameraOk ? "text-muted" : `${primary} text-background`}`}>
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => fromFile(e.target.files?.[0], "photo")} />
            {cameraOk ? "or choose a photo" : "Take or choose a photo"}
          </label>
        </>
      )}

      {step === "review" && photo && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
          <img src={photo.url} alt="Your check-in photo" className="mt-4 aspect-[3/4] w-full rounded-2xl object-cover" />
          <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-surface p-3 text-sm">
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => fromFile(e.target.files?.[0], "closeUp")} />
            {closeUp ? (
              // eslint-disable-next-line @next/next/no-img-element -- local blob preview
              <img src={closeUp.url} alt="" className="h-12 w-12 rounded-lg object-cover" />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-leaf-soft text-xl">🔍</span>
            )}
            <span>
              <b>Anything worrying?</b> <span className="text-muted">Add a close-up (optional)</span>
            </span>
          </label>
          <button onClick={submit} className={`${primary} mt-6`}>
            Check {nickname}
          </button>
          <button
            onClick={() => {
              setPhoto(null);
              setStep("camera");
            }}
            className="mt-2 w-full py-2 text-sm text-muted"
          >
            Retake
          </button>
        </>
      )}

      {step === "checking" && (
        <section className="mt-24 text-center" aria-live="polite">
          <p className="animate-pulse text-6xl">🌿</p>
          <p className="mt-6 text-xl font-semibold">Comparing with last time…</p>
          <p className="mt-2 text-sm text-muted">This usually takes under a minute.</p>
        </section>
      )}

      {step === "result" && result && (
        <>
          <Changes assessment={result.assessment} previous={result.previous} />
          <div className="mt-6">
            <ReportCard scores={result.assessment.scores} issues={result.assessment.issues} actions={result.assessment.actions} />
          </div>
          <button
            onClick={() => {
              router.push(result.rescuePlanId ? `/plants/${plantId}/rescue` : `/plants/${plantId}`);
              router.refresh();
            }}
            className={`${primary} mt-8`}
          >
            {result.rescuePlanId ? "See the updated rescue plan" : "Done"}
          </button>
        </>
      )}
    </main>
  );
}

/** What changed since the previous check: health plus any score that moved by 5+. */
function Changes({ assessment, previous }: { assessment: Assessment; previous: Previous }) {
  if (!previous) return null;
  const health = assessment.scores.health.value - previous.health;
  const moved = SCORE_KEYS.filter((k) => k !== "health")
    .map((k) => ({ k, d: assessment.scores[k].value - (previous.scores[k]?.value ?? assessment.scores[k].value) }))
    .filter((c) => Math.abs(c.d) >= 5);
  const since = new Date(previous.date).toLocaleDateString(undefined, { day: "numeric", month: "long" });
  const arrow = (d: number) => (d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${-d}` : "no change");

  return (
    <section className="mt-4 rounded-2xl bg-leaf-soft p-4 text-sm">
      <p className="font-semibold">Since {since}</p>
      <p className="mt-1">
        Health {previous.health} → <b>{assessment.scores.health.value}</b> <span className="text-muted">({arrow(health)})</span>
      </p>
      {moved.length > 0 ? (
        <ul className="mt-1 text-muted">
          {moved.map((c) => (
            <li key={c.k}>
              {SCORE_LABELS[c.k]}: {arrow(c.d)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-muted">Everything else is about the same.</p>
      )}
    </section>
  );
}
