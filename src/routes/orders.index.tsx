import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronRight, ReceiptText, RotateCcw, UserRound } from "lucide-react";
import { PageShell, Panel, SectionLabel } from "@/components/app/checkout-ui";
import {
  OrderPhaseIcon,
  OrderProgressRail,
  OrderStatusPill,
  isPickupOrder,
  orderPhase,
  orderStages,
  orderStatusLabel,
  stageIndexFor,
} from "@/components/app/order-ui";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { money, type FirebaseOrder } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/orders/")({
  head: () => ({
    meta: [
      { title: "Your orders — Hearth" },
      {
        name: "description",
        content: "Track current orders, revisit past deliveries and reorder your favourites.",
      },
      { property: "og:title", content: "Your orders — Hearth" },
      {
        property: "og:description",
        content: "Live order status, receipts and one-tap reordering.",
      },
    ],
  }),
  component: OrdersPage,
});

type OrdersFilter = "all" | "active" | "past";

/** Item counts live under the order's `items` map, which the order type doesn't declare. */
function itemCountOf(order: FirebaseOrder): number | null {
  const items = (order as { items?: unknown }).items;
  const lines = Array.isArray(items)
    ? items
    : items && typeof items === "object"
      ? Object.values(items as Record<string, unknown>)
      : null;
  if (!lines || lines.length === 0) return null;

  return lines.reduce<number>(
    (total, line) => total + (Number((line as { quantity?: unknown })?.quantity) || 0),
    0,
  );
}

function formatPlacedAt(value: string | null | undefined) {
  if (!value) return "Recent";
  const placed = new Date(value);
  if (Number.isNaN(placed.getTime())) return "Recent";
  return placed.toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function etaLabel(order: FirebaseOrder, isPickup: boolean) {
  const status = (order.status || "pending").toLowerCase();

  if (isPickup) {
    if (status === "ready") return "Ready for collection now";
    if (status === "picked_up") return "Collected — enjoy!";
    return order.eta_minutes ? `Ready in ~${order.eta_minutes} min` : "Preparing your order";
  }

  return order.eta_minutes
    ? `Arriving in ~${order.eta_minutes} min`
    : "Working out your arrival time";
}

function OrdersPage() {
  const { orders } = useCart();
  const { user } = useAuth();
  const [filter, setFilter] = useState<OrdersFilter>("all");

  const { active, past } = useMemo(() => {
    const valid = orders.filter((order) => order && order.id);
    return {
      active: valid.filter((order) => orderPhase(order.status) === "active"),
      past: valid.filter((order) => orderPhase(order.status) !== "active"),
    };
  }, [orders]);

  const filters = [
    { id: "all", label: "All", count: active.length + past.length },
    { id: "active", label: "Active", count: active.length },
    { id: "past", label: "Past", count: past.length },
  ] as const;

  const showActive = filter !== "past" && active.length > 0;
  const showPast = filter !== "active" && past.length > 0;
  const hasOrders = active.length + past.length > 0;

  return (
    <PageShell>
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 px-4 pt-4 pb-3 backdrop-blur-md md:static">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl leading-none font-black tracking-tight">Orders</h1>
            <p className="label-mono mt-2 truncate text-muted-foreground">
              {active.length > 0
                ? `${active.length} in progress`
                : hasOrders
                  ? `${past.length} completed`
                  : "Nothing yet"}
            </p>
          </div>

          {active.length > 0 ? (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-black tracking-wider text-primary uppercase">
              <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden />
              Live
            </span>
          ) : null}
        </div>

        {hasOrders ? (
          <div
            role="group"
            aria-label="Filter orders"
            className="mt-4 grid grid-cols-3 gap-1 rounded-xl border border-border bg-secondary p-1"
          >
            {filters.map(({ id, label, count }) => {
              const selected = filter === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  aria-pressed={selected}
                  className={cn(
                    "flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-[11px] font-black tracking-wider uppercase transition-all",
                    selected
                      ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                  <span
                    className={cn(
                      "font-mono text-[10px] tabular-nums",
                      selected ? "text-primary" : "text-muted-foreground/70",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </header>

      <main className="space-y-6 px-4 pt-5 pb-44 md:pb-24">
        {!hasOrders ? (
          <div className="px-4 py-16 text-center">
            <div className="mx-auto grid size-16 place-items-center rounded-2xl border border-border bg-secondary">
              <ReceiptText className="size-7 text-muted-foreground" aria-hidden />
            </div>
            <h2 className="mt-5 text-xl font-black tracking-tight">No orders yet</h2>
            <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
              {user
                ? "Orders you place show up here with live tracking straight from the kitchen."
                : "Sign in to see orders you placed before, or start a new one right now."}
            </p>
            <Link
              to="/"
              className="mt-6 inline-flex h-12 cursor-pointer items-center justify-center rounded-xl bg-primary px-7 text-xs font-black tracking-[0.1em] text-primary-foreground uppercase shadow-lg shadow-primary/25 transition-colors hover:bg-primary/90"
            >
              Start an order
            </Link>

            {!user ? (
              <Link
                to="/account"
                className="mt-4 flex items-center justify-center gap-1.5 text-xs font-bold text-primary hover:underline"
              >
                <UserRound className="size-3.5" aria-hidden />
                Sign in to your account
              </Link>
            ) : null}
          </div>
        ) : null}

        {showActive ? (
          <section>
            <SectionLabel>In progress</SectionLabel>
            <div className="space-y-3">
              {active.map((order) => (
                <ActiveOrderCard key={order.id} order={order} />
              ))}
            </div>
          </section>
        ) : null}

        {showPast ? (
          <section>
            <SectionLabel>Past orders</SectionLabel>
            <Panel className="divide-y divide-border overflow-hidden">
              {past.map((order) => (
                <PastOrderRow key={order.id} order={order} />
              ))}
            </Panel>
          </section>
        ) : null}

        {hasOrders && !showActive && !showPast ? (
          <p className="py-14 text-center text-sm text-muted-foreground">
            {filter === "active" ? "No orders in progress right now." : "No completed orders yet."}
          </p>
        ) : null}
      </main>
    </PageShell>
  );
}

/** Live order — the progress rail and arrival time do the talking. */
function ActiveOrderCard({ order }: { order: FirebaseOrder }) {
  const isPickup = isPickupOrder(order);
  const stages = orderStages(isPickup);
  const index = stageIndexFor(order.status, stages);

  return (
    <Link
      to="/orders/$orderId"
      params={{ orderId: order.id }}
      className="block rounded-2xl border border-border bg-card shadow-sm transition-colors hover:border-primary/30 hover:bg-secondary/30"
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm leading-tight font-bold">
              {order.restaurant_name || "Restaurant"}
            </p>
            <p className="label-mono mt-1.5 truncate text-muted-foreground">
              {order.order_number || order.id}
            </p>
          </div>
          <OrderStatusPill status={order.status} isPickup={isPickup} />
        </div>

        <OrderProgressRail stages={stages} index={index} phase="active" className="mt-4" />

        <p className="mt-3 text-sm font-bold">{etaLabel(order, isPickup)}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {stages[index]?.detail ?? "Your order is being handled."}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
        <span className="min-w-0 truncate text-[11px] text-muted-foreground">
          Placed {formatPlacedAt(order.placed_at)}
        </span>
        <span className="flex shrink-0 items-center gap-1 font-mono text-sm font-black tabular-nums">
          {money(order.total || 0)}
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

/** Finished order — compact row, with reorder sitting above the stretched link. */
function PastOrderRow({ order }: { order: FirebaseOrder }) {
  const navigate = useNavigate();
  const isPickup = isPickupOrder(order);
  const phase = orderPhase(order.status);
  const items = itemCountOf(order);

  const meta = [
    formatPlacedAt(order.placed_at),
    orderStatusLabel(order.status, isPickup),
    items ? `${items} ${items === 1 ? "item" : "items"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="relative flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-secondary/40">
      <OrderPhaseIcon phase={phase} isPickup={isPickup} />

      <div className="min-w-0 flex-1">
        <Link
          to="/orders/$orderId"
          params={{ orderId: order.id }}
          className="block truncate text-sm font-bold after:absolute after:inset-0 after:content-['']"
        >
          {order.restaurant_name || "Restaurant"}
        </Link>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{meta}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className="font-mono text-sm font-black tabular-nums">{money(order.total || 0)}</span>

        {order.restaurant_id ? (
          <button
            type="button"
            onClick={() =>
              void navigate({ to: "/restaurant/$slug", params: { slug: order.restaurant_id } })
            }
            aria-label={`Reorder from ${order.restaurant_name || "this restaurant"}`}
            className="relative z-10 grid size-9 cursor-pointer place-items-center rounded-lg border border-border bg-secondary text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            <RotateCcw className="size-4" aria-hidden />
          </button>
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        )}
      </div>
    </div>
  );
}
