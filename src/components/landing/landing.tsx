import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { CareDemo } from "./care-demo";
import {
  AwayScene,
  BeatingHeart,
  BuddyScene,
  GrowScene,
  HeroPlant,
  PaintDefs,
  RescueScene,
  SnapScene,
  WaterScene,
} from "./illustrations";

const SIGN_UP = "/login?mode=signup";

type TileProps = { color: string; title: string; text: string; scene: ReactNode; className?: string; wide?: boolean };

function Tile({ color, title, text, scene, className = "", wide = false }: TileProps) {
  return (
    <article className={`paper flex flex-col overflow-hidden rounded-[28px] ${color} ${wide ? "sm:flex-row sm:items-center" : ""} ${className}`}>
      <div className={`aspect-[4/3] w-full p-4 ${wide ? "sm:w-1/2 sm:max-w-[420px]" : ""}`}>{scene}</div>
      <div className={`px-6 pb-6 ${wide ? "sm:py-6 sm:pl-2" : ""}`}>
        <h3 className="font-display text-2xl font-bold tracking-tight">{title}</h3>
        <p className="mt-1.5 text-[15px] leading-relaxed text-ink/75">{text}</p>
      </div>
    </article>
  );
}

function Step({ n, color, title, text }: { n: number; color: string; title: string; text: string }) {
  return (
    <li className={`demo-step${n} flex gap-4`}>
      <span className={`paper grid size-12 shrink-0 place-items-center rounded-full font-display text-xl font-bold ${color}`}>{n}</span>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-muted">{text}</p>
      </div>
    </li>
  );
}

export function Landing() {
  return (
    <div className="landing flex-1">
      <PaintDefs />
      <div className="mx-auto w-full max-w-[1100px] px-4 sm:px-6">
        <header className="flex items-center justify-between py-5">
          <Link href="/" aria-label="I Love My Plants home">
            <Logo size={40} withName compactOnPhone />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link href="/login" className="rounded-full px-3 py-2 font-medium hover:bg-sand/60 sm:px-4">
              Sign in
            </Link>
            <Link href={SIGN_UP} className="rounded-full bg-ink px-4 py-2 font-medium text-cream hover:bg-ink/85 sm:px-5">
              Start free
            </Link>
          </nav>
        </header>

        <main>
          <section className="grid items-center gap-6 pb-12 pt-6 md:grid-cols-[1.1fr_1fr] md:gap-10 md:pb-20 md:pt-12">
            <div>
              <h1 className="font-display text-[2.6rem] font-bold leading-[1.02] tracking-[-0.03em] sm:text-6xl">
                Snap a photo. Know what your plant needs.
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
                A health check from one photo, three simple steps for today, and a gentle nudge when your plant is thirsty.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={SIGN_UP} className="rounded-full bg-ink px-7 py-3.5 font-medium text-cream hover:bg-ink/85">
                  Create free account
                </Link>
                <Link href="/login" className="rounded-full border border-ink/20 px-7 py-3.5 font-medium hover:bg-sand/60">
                  Sign in
                </Link>
              </div>
              <p className="mt-4 text-sm text-muted">Free. Works on any phone, and you can add it to your home screen.</p>
            </div>
            <div className="paper mx-auto aspect-square w-full max-w-[460px] rounded-[36px] bg-sand">
              <HeroPlant />
            </div>
          </section>

          <section aria-labelledby="features" className="pb-16 md:pb-24">
            <h2 id="features" className="sr-only">
              What it does
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Tile
                wide
                className="sm:col-span-2"
                color="bg-lavender"
                title="Photo health check"
                text="Leaves, soil, light, pot and pests, all from one photo. You get a simple report card and three things to do today."
                scene={<SnapScene />}
              />
              <Tile
                color="bg-sage"
                title="Watering that learns"
                text="Reminders that adjust to your plant, its window and the daylight where you live."
                scene={<WaterScene />}
              />
              <Tile
                color="bg-sand"
                title="Grows with your plant"
                text="A repot and feeding plan, plus a time-lapse of every check-in."
                scene={<GrowScene />}
              />
              <Tile
                color="bg-terracotta"
                title="Rescue Plant"
                text="Yellow leaves or a droopy stem? Get a calm, step-by-step rescue plan."
                scene={<RescueScene />}
              />
              <Tile
                color="bg-butter"
                title="Going away?"
                text="A checklist before you leave, and a private link for your plant-sitter: it shows them your plants and what to do each day. They don't need an account."
                scene={<AwayScene />}
              />
              <Tile
                wide
                className="sm:col-span-2 lg:col-span-3"
                color="bg-paper border border-ink/10"
                title="Plant wellbeing via Telegram chat"
                text="Ask a question, send a photo of a fertiliser to check it suits your plant, and get your reminders right in the chat."
                scene={<BuddyScene />}
              />
            </div>
          </section>

          <section aria-labelledby="how" className="pb-16 md:pb-24">
            <h2 id="how" className="font-display text-4xl font-bold tracking-tight">
              How it works
            </h2>
            <div className="mt-8 grid items-center gap-8 md:grid-cols-[1.15fr_1fr] md:gap-12">
              <div className="paper aspect-[5/4] w-full rounded-[36px] bg-sand p-3 sm:p-5">
                <CareDemo />
              </div>
              <ol className="space-y-7">
                <Step n={1} color="bg-lavender" title="Snap a photo" text="Add your plant with one picture. We work out what it is and how it's doing." />
                <Step n={2} color="bg-butter" title="Get three steps for today" text="A health score and clear, small things to do. Nothing more." />
                <Step n={3} color="bg-sage" title="Get a nudge when it's time" text="On your phone or in Telegram, at a time that suits you." />
              </ol>
            </div>
          </section>

          <section className="paper mb-12 flex flex-col items-center rounded-[36px] bg-terracotta px-6 py-12 text-center md:py-16">
            <BeatingHeart className="mb-4 size-24 sm:size-28" />
            {/* One line at every width: the size follows the screen, capped at 3rem (the line is ~12.1em wide). */}
            <h2 className="whitespace-nowrap font-display text-[length:clamp(1.125rem,calc((100vw_-_6rem)/12.6),3rem)] font-bold tracking-tight">
              Your plants will thank you.
            </h2>
            <p className="mt-3 max-w-md text-ink/75">Start with one plant. It takes about a minute.</p>
            <Link href={SIGN_UP} className="mt-8 rounded-full bg-ink px-7 py-3.5 font-medium text-cream hover:bg-ink/85">
              Create free account
            </Link>
          </section>
        </main>

        <footer className="flex flex-col gap-3 border-t border-ink/10 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <Logo size={28} withName />
          <p>
            Made with <span role="img" aria-label="love">❤️</span> in Vilnius, Lithuania. Suitable for all the plants across
            the globe <span aria-hidden>🌍</span>
          </p>
        </footer>
      </div>
    </div>
  );
}
