import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, MessageCircle, Phone, Star } from "lucide-react";
import { currentStage, stageCopy, stageOrder, useCart } from "@/lib/cart";
import { getRestaurant, money } from "@/lib/data";

export const Route = createFileRoute("/orders/$orderId")({
  head: () => ({
    meta: [
      { title: "Track your order — Hearth" },
      {
        name: "description",
        content: "Follow your order live: kitchen progress, driver assignment and arrival time.",
      },
      { property: "og:title", content: "Track your order — Hearth" },
      {
        property: "og:description",
        content: "Live timeline, driver details and estimated arrival for your delivery.",
      },
    ],
  }),
  component: TrackOrder,
});

function TrackOrder() {
  const { orderId } = Route.useParams();
  const { getOrder } = useCart();
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const order = getOrder(orderId);

  if (!ready) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-md px-4 md:max-w-2xl py-16">
        <div className="h-40 animate-pulse rounded-3xl bg-secondary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-md px-4 md:max-w-2xl py-20 text-center">
        <h1 className="text-2xl font-black tracking-tight">Order not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This order isn't on this device. Check your order list.
        </p>
        <Link
          to="/orders"
          className="mt-6 inline-flex h-14 items-center rounded-2xl bg-primary px-8 text-sm font-black tracking-[0.1em] text-primary-foreground uppercase"
        >
          My orders
        </Link>
      </div>
    );
  }

  const stage = currentStage(order, now);
  const stageIndex = stageOrder.indexOf(stage);
  const restaurant = getRestaurant(order.restaurantSlug);
  const minutesLeft = Math.max(0, Math.round((order.etaAt - now) / 60000));
  const progress = Math.min(100, ((stageIndex + 1) / stageOrder.length) * 100);

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-background md:max-w-2xl">
      <header className="sticky top-0 z-40 md:static flex items-center gap-3 border-b border-border bg-background/90 px-4 py-4 backdrop-blur-md">
        <Link
          to="/orders"
          aria-label="Back to orders"
          className="grid size-11 place-items-center rounded-full bg-secondary ring-1 ring-border"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <div>
          <h1 className="text-lg leading-none font-black tracking-tight">{order.restaurantName}</h1>
          <p className="label-mono mt-1 text-muted-foreground">{order.id}</p>
        </div>
      </header>

      <main className="space-y-6 px-4 pt-6 pb-32">
        {/* Live map area */}
        <div className="relative aspect-[16/10] overflow-hidden rounded-3xl bg-secondary ring-1 ring-border">
          <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(var(--color-border)_1px,transparent_1px),linear-gradient(90deg,var(--color-border)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="absolute top-1/2 left-6 size-3 -translate-y-1/2 rounded-full bg-foreground" />
          <div className="absolute top-1/2 right-6 size-3 -translate-y-1/2 rounded-full bg-primary" />
          <div className="absolute top-1/2 right-6 left-6 h-0.5 -translate-y-1/2 bg-border" />
          <div
            className="absolute top-1/2 left-6 h-0.5 -translate-y-1/2 bg-primary transition-all duration-1000"
            style={{ width: `calc((100% - 48px) * ${progress / 100})` }}
          />
          <div
            className="absolute top-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl bg-primary text-[10px] font-black text-primary-foreground shadow-xl transition-all duration-1000"
            style={{ left: `calc(24px + (100% - 48px) * ${progress / 100})` }}
          >
            {order.mode === "pickup" ? "YOU" : "DRV"}
          </div>
          <span className="label-mono absolute bottom-4 left-4 rounded-full bg-background/90 px-3 py-1.5 ring-1 ring-border backdrop-blur">
            {order.mode === "pickup" ? "Pickup" : order.address}
          </span>
        </div>

        <div className="rounded-3xl bg-foreground p-6 text-background">
          <span className="label-mono opacity-60">Estimated arrival</span>
          <p className="mt-1 text-3xl font-black tracking-tight">
            {stage === "delivered" ? "Delivered" : `${minutesLeft} min`}
          </p>
          <p className="mt-2 text-sm opacity-70">{stageCopy[stage].detail}</p>
        </div>

        <ol className="space-y-4">
          {stageOrder.map((s, i) => {
            const done = i <= stageIndex;
            return (
              <li key={s} className="flex items-start gap-4">
                <div className="flex flex-col items-center">
                  <span
                    className={`mt-1 size-2.5 rounded-full ${done ? "bg-primary" : "bg-border"}`}
                  />
                  {i < stageOrder.length - 1 ? (
                    <span className={`h-8 w-px ${done ? "bg-primary/40" : "bg-border"}`} />
                  ) : null}
                </div>
                <div className={done ? "" : "opacity-40"}>
                  <p className="text-sm font-bold">{stageCopy[s].title}</p>
                  <p className="text-xs text-muted-foreground">{stageCopy[s].detail}</p>
                </div>
              </li>
            );
          })}
        </ol>

        {stageIndex >= stageOrder.indexOf("driver_assigned") && order.mode === "delivery" ? (
          <section className="flex items-center gap-4 rounded-3xl bg-card p-5 ring-1 ring-border">
            <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-sm font-black">
              NK
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{order.driver.name}</p>
              <p className="label-mono mt-1 text-muted-foreground">{order.driver.vehicle}</p>
            </div>
            <span className="flex items-center gap-1 text-sm font-black">
              <Star className="size-3.5 fill-primary text-primary" aria-hidden />
              {order.driver.rating}
            </span>
          </section>
        ) : null}

        <section className="grid grid-cols-2 gap-2">
          <a
            href={`tel:${restaurant?.phone ?? ""}`}
            className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-secondary text-[11px] font-black tracking-widest uppercase ring-1 ring-border"
          >
            <Phone className="size-4" aria-hidden />
            Call restaurant
          </a>
          <button
            type="button"
            className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-secondary text-[11px] font-black tracking-widest uppercase ring-1 ring-border"
          >
            <MessageCircle className="size-4" aria-hidden />
            Support
          </button>
        </section>

        <section className="space-y-2 rounded-3xl bg-secondary p-5 ring-1 ring-border">
          <h2 className="label-mono mb-2 text-muted-foreground">Receipt</h2>
          {order.lines.map((l) => (
            <div key={l.lineId} className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {l.qty}× {l.name}
              </span>
              <span className="font-mono font-bold">{money(l.unitPrice * l.qty)}</span>
            </div>
          ))}
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm font-black tracking-widest uppercase">Paid</span>
            <span className="font-mono text-lg font-black">{money(order.total)}</span>
          </div>
        </section>

        <button
          type="button"
          onClick={() => void navigate({ to: "/restaurant/$slug", params: { slug: order.restaurantSlug } })}
          className="h-14 w-full rounded-2xl bg-primary text-sm font-black tracking-[0.1em] text-primary-foreground uppercase"
        >
          Order this again
        </button>
      </main>
    </div>
  );
}
