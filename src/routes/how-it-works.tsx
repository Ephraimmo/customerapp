import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Headphones,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { BrandMark } from "@/components/app/logo";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How to order — Kasi Zonke Link" },
      {
        name: "description",
        content:
          "A narrated walkthrough of ordering on Kasi Zonke Link: create your account, set your delivery address, order from a kitchen, pay and track your delivery.",
      },
      { property: "og:title", content: "How to order — Kasi Zonke Link" },
      {
        property: "og:description",
        content: "Watch the full ordering journey, step by step, in under two and a half minutes.",
      },
    ],
  }),
  component: HowItWorksPage,
});

const VIDEO = "/tutorial/how-to-order.mp4";
const POSTER = "/tutorial/how-to-order-poster.jpg";

/** Offsets come from the recording itself, so seeking lands on the real step. */
type Chapter = {
  n: number;
  title: string;
  hint: string;
  start: number;
  end: number;
  detail: string;
};

const CHAPTERS: Chapter[] = [
  {
    n: 1,
    title: "Create your account",
    hint: "Sign in → Register → Create Account",
    start: 0,
    end: 26.14,
    detail:
      "Tap Sign in, switch to the Register tab, then enter your name, email, phone number and a password. Once you're registered your cart, your saved addresses and your loyalty points are kept on your account, so you can start an order on one phone and finish it on another.",
  },
  {
    n: 2,
    title: "Set your delivery address",
    hint: "Street, city, GPS pin, then save",
    start: 26.14,
    end: 48.38,
    detail:
      "Open the address selector from the top of the home screen. Fill in your street and city, then tap Current location so we can pin you exactly. Give the address a label like Home or Work and save it — your delivery fee and arrival time are both worked out from this pin.",
  },
  {
    n: 3,
    title: "Pick a kitchen and add food",
    hint: "Browse, open a dish, choose your options",
    start: 48.38,
    end: 76.01,
    detail:
      "Every restaurant card shows the distance, the delivery fee and how long the food will take. Open a kitchen, tap a dish, then choose any sizes or extras it offers and leave a note for the chef. The price updates as you choose, so you always know the total before you add it.",
  },
  {
    n: 4,
    title: "Check your cart",
    hint: "Quantities, promo codes, and your total",
    start: 76.01,
    end: 93.75,
    detail:
      "Tap View Cart to review everything before you pay. Change the quantity, remove an item, or enter a promo code. Your subtotal, delivery fee and total are all shown before any money changes hands.",
  },
  {
    n: 5,
    title: "Place your order",
    hint: "Confirm address, pay cash on delivery, send it",
    start: 93.75,
    end: 115.79,
    detail:
      "Continue to checkout, confirm the delivery address, then pick how you want to pay — in this walkthrough we pay cash on delivery, so you hand the money to the driver when the food arrives. Check the summary, then place the order and the kitchen gets it straight away.",
  },
  {
    n: 6,
    title: "Track it to your door",
    hint: "Live status, driver, and support",
    start: 115.79,
    end: 138.16,
    detail:
      "Your order screen updates itself as the kitchen accepts it, prepares it and hands it to a driver. You'll see the estimated arrival time, the live map once a driver is assigned, and your full receipt. If anything goes wrong, support is one tap away from this screen.",
  },
];

/** CHAPTERS is a fixed literal, so these are safe under noUncheckedIndexedAccess. */
const FIRST = CHAPTERS[0] as Chapter;
const LAST = CHAPTERS[CHAPTERS.length - 1] as Chapter;

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function HowItWorksPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(LAST.end);
  const [started, setStarted] = useState(false);

  const active: Chapter = [...CHAPTERS].reverse().find((c) => time >= c.start - 0.15) ?? FIRST;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setTime(v.currentTime);
    const onMeta = () => setDuration(v.duration || duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("seeked", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("seeked", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, [duration]);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setStarted(true);
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const seek = useCallback((to: number) => {
    const v = videoRef.current;
    if (!v) return;
    setStarted(true);
    v.currentTime = to;
    // Reflect the jump immediately: a browser that refuses autoplay never
    // fires timeupdate, which would leave the readout stuck at the old step.
    setTime(to);
    v.play().catch(() => {});
  }, []);

  /** The app UI inside the video is small at phone width, so full screen is
   *  the difference between a usable tutorial and an unreadable one. */
  const goFullscreen = useCallback(() => {
    const v = videoRef.current as
      (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    const box = frameRef.current;
    if (box?.requestFullscreen) void box.requestFullscreen().catch(() => {});
    else if (v?.requestFullscreen) void v.requestFullscreen().catch(() => {});
    else v?.webkitEnterFullscreen?.(); // iOS Safari only exposes this on the video
  }, []);

  return (
    <div className="mx-auto min-h-dvh w-full max-w-full bg-background pb-28 sm:max-w-[640px] md:max-w-3xl md:pb-16 lg:max-w-5xl">
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-md md:static md:border-0 md:bg-transparent md:pt-8">
        <Link
          to="/"
          aria-label="Back to discover"
          className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full bg-secondary ring-1 ring-border transition-colors hover:bg-secondary/70 md:hidden"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <div className="min-w-0">
          <p className="label-mono text-muted-foreground">Kasi Zonke Link</p>
          <h1 className="truncate text-lg leading-tight font-black tracking-tight md:text-3xl">
            How to order
          </h1>
        </div>
        <BrandMark className="ml-auto size-7 shrink-0 text-primary" />
      </header>

      <main className="px-4 pt-5 md:pt-6">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
          A short narrated walkthrough of the whole journey — from creating your account to checking
          your cart. Jump to any step using the list below the video, and turn your phone sideways
          or tap full screen to see the detail.
        </p>

        {/* Player */}
        <div
          ref={frameRef}
          className="mt-5 overflow-hidden rounded-[28px] bg-[#14120f] ring-1 ring-border md:rounded-[32px]"
        >
          <div className="relative">
            <video
              ref={videoRef}
              src={VIDEO}
              poster={POSTER}
              playsInline
              preload="metadata"
              muted={muted}
              className="aspect-video w-full bg-[#14120f]"
              onClick={toggle}
            />

            {!started ? (
              <button
                type="button"
                onClick={toggle}
                aria-label="Play the tutorial"
                className="absolute inset-0 grid cursor-pointer place-items-center bg-foreground/35 transition-colors hover:bg-foreground/25"
              >
                <span className="grid size-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-2xl shadow-primary/40 md:size-20">
                  <Play className="size-7 translate-x-0.5 fill-current md:size-9" aria-hidden />
                </span>
              </button>
            ) : null}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 px-3 pt-2 pb-3 md:px-4">
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? "Pause" : "Play"}
              className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {playing ? (
                <Pause className="size-4 fill-current" aria-hidden />
              ) : (
                <Play className="size-4 translate-x-px fill-current" aria-hidden />
              )}
            </button>

            <button
              type="button"
              onClick={() => seek(0)}
              aria-label="Restart from the beginning"
              className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
            >
              <RotateCcw className="size-4" aria-hidden />
            </button>

            <div className="min-w-0 flex-1">
              {/* Segmented scrubber: one segment per step, so the shape of the
                  lesson is visible before you play it. */}
              <div className="flex h-2 gap-1">
                {CHAPTERS.map((c) => {
                  const span = c.end - c.start;
                  const done = Math.min(Math.max(time - c.start, 0), span) / span;
                  return (
                    <button
                      key={c.n}
                      type="button"
                      onClick={() => seek(c.start + 0.05)}
                      aria-label={`Step ${c.n}: ${c.title}`}
                      style={{ flexGrow: span }}
                      className="group relative h-2 cursor-pointer overflow-hidden rounded-full bg-white/15"
                    >
                      <span
                        className="absolute inset-y-0 left-0 bg-primary transition-[width] duration-150"
                        style={{ width: `${done * 100}%` }}
                      />
                    </button>
                  );
                })}
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-bold text-white/70">
                  Step {active.n} · {active.title}
                </span>
                <span className="label-mono shrink-0 text-white/50">
                  {fmt(time)} / {fmt(duration)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? "Unmute narration" : "Mute narration"}
              className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
            >
              {muted ? (
                <VolumeX className="size-4" aria-hidden />
              ) : (
                <Volume2 className="size-4" aria-hidden />
              )}
            </button>

            <button
              type="button"
              onClick={goFullscreen}
              aria-label="Watch full screen"
              className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
            >
              <Maximize2 className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        {/* Steps */}
        <h2 className="mt-8 text-lg font-black tracking-tight md:text-xl">The steps</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Tap a step to jump straight to it in the video.
        </p>

        <ol className="mt-4 space-y-3">
          {CHAPTERS.map((c) => {
            const isActive = active.n === c.n && started;
            const isDone = time >= c.end - 0.2;
            return (
              <li key={c.n}>
                <button
                  type="button"
                  onClick={() => seek(c.start + 0.05)}
                  aria-current={isActive ? "step" : undefined}
                  className={`flex w-full cursor-pointer items-start gap-3.5 rounded-3xl p-4 text-left transition-colors ${
                    isActive
                      ? "bg-primary/10 ring-2 ring-primary"
                      : "bg-card ring-1 ring-border hover:bg-secondary/50"
                  }`}
                >
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-full font-mono text-xs font-black ${
                      isDone && !isActive
                        ? "bg-primary/15 text-primary"
                        : isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground ring-1 ring-border"
                    }`}
                  >
                    {isDone && !isActive ? <Check className="size-4" aria-hidden /> : c.n}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-base leading-tight font-bold">{c.title}</span>
                      <span className="label-mono shrink-0 text-muted-foreground">
                        {fmt(c.start)}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs font-bold text-primary">{c.hint}</span>
                    <span className="mt-1.5 block text-sm leading-relaxed text-muted-foreground">
                      {c.detail}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/"
            className="flex h-14 flex-1 items-center justify-center rounded-2xl bg-primary text-sm font-black tracking-[0.1em] text-primary-foreground uppercase shadow-lg shadow-primary/30 transition-colors hover:bg-primary/90"
          >
            Start ordering
          </Link>
          <Link
            to="/support"
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-secondary text-sm font-black tracking-wider text-foreground uppercase ring-1 ring-border transition-colors hover:bg-secondary/70"
          >
            <Headphones className="size-4" aria-hidden />
            Still stuck? Get help
          </Link>
        </div>
      </main>
    </div>
  );
}
