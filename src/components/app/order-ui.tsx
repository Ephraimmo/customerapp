import { Bike, CheckCircle2, RotateCcw, Store, XCircle } from "lucide-react";
import type { FirebaseOrder, OrderStatus } from "@/lib/data";
import { cn } from "@/lib/utils";

/*
 * Shared order vocabulary — one definition of the stages, the phase and the
 * status pill so the orders list and the tracking page always read the same.
 */

export type OrderStage = {
  status: OrderStatus | "placed";
  label: string;
  detail: string;
};

export const DELIVERY_STAGES: OrderStage[] = [
  { status: "placed", label: "Order placed", detail: "Sent to the kitchen" },
  { status: "pending", label: "Order received", detail: "Waiting for kitchen acceptance" },
  { status: "accepted", label: "Restaurant accepted", detail: "Kitchen confirmed your order" },
  { status: "preparing", label: "Preparing food", detail: "Chef is cooking to order" },
  { status: "ready", label: "Ready for pickup", detail: "Packed, sealed and ready" },
  { status: "assigned", label: "Driver assigned", detail: "Heading to the restaurant" },
  { status: "picked_up", label: "Driver picked up", detail: "Food collected from kitchen" },
  { status: "on_the_way", label: "On the way", detail: "Driver is en route to your address" },
  { status: "delivered", label: "Delivered", detail: "Enjoy your meal!" },
];

export const PICKUP_STAGES: OrderStage[] = [
  { status: "placed", label: "Order placed", detail: "Sent to the kitchen" },
  { status: "pending", label: "Order received", detail: "Waiting for kitchen acceptance" },
  { status: "accepted", label: "Restaurant accepted", detail: "Kitchen confirmed your order" },
  { status: "preparing", label: "Preparing food", detail: "Chef is cooking to order" },
  {
    status: "ready",
    label: "Ready for pickup",
    detail: "Packed and ready for collection at the kitchen",
  },
  { status: "picked_up", label: "Collected — enjoy!", detail: "Food collected by customer" },
  { status: "delivered", label: "Collected — enjoy!", detail: "Order closed" },
];

export type OrderPhase = "active" | "delivered" | "cancelled" | "refunded";

export function orderPhase(status: string | null | undefined): OrderPhase {
  switch ((status || "pending").toLowerCase()) {
    case "cancelled":
      return "cancelled";
    case "refunded":
      return "refunded";
    case "delivered":
      return "delivered";
    default:
      return "active";
  }
}

/** Orders placed before `order_type` existed are inferred from address and fee. */
export function isPickupOrder(order: Partial<FirebaseOrder> | null | undefined) {
  if (!order) return false;
  if (order.order_type === "pickup") return true;
  return !order.delivery_address && (order.delivery_fee ?? 0) === 0;
}

export function orderStages(isPickup: boolean) {
  return isPickup ? PICKUP_STAGES : DELIVERY_STAGES;
}

/** Index of the current stage, defaulting to "order received" for unknown statuses. */
export function stageIndexFor(status: string | null | undefined, stages: OrderStage[]) {
  const current = (status || "pending").toLowerCase();
  const index = stages.findIndex((stage) => stage.status === current);
  return index >= 0 ? index : 1;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Awaiting kitchen",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  assigned: "Driver assigned",
  picked_up: "Picked up",
  on_the_way: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export function orderStatusLabel(status: string | null | undefined, isPickup = false) {
  const current = (status || "pending").toLowerCase();
  if (isPickup) {
    if (current === "ready") return "Ready for pickup";
    if (current === "picked_up" || current === "delivered") return "Collected";
  }
  return STATUS_LABELS[current] ?? current.replace(/_/g, " ");
}

const PHASE_TONES: Record<OrderPhase, string> = {
  active: "border-primary/25 bg-primary/10 text-primary",
  delivered: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  cancelled: "border-destructive/25 bg-destructive/10 text-destructive",
  refunded: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

/** Status chip — a pulsing dot marks an order that is still moving. */
export function OrderStatusPill({
  status,
  isPickup,
  className,
}: {
  status: string | null | undefined;
  isPickup?: boolean;
  className?: string;
}) {
  const phase = orderPhase(status);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] leading-none font-black tracking-wider whitespace-nowrap uppercase",
        PHASE_TONES[phase],
        className,
      )}
    >
      {phase === "active" ? (
        <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden />
      ) : null}
      {orderStatusLabel(status, isPickup)}
    </span>
  );
}

/** Segmented rail showing how far through the stages an order is. */
export function OrderProgressRail({
  stages,
  index,
  phase,
  className,
}: {
  stages: OrderStage[];
  index: number;
  phase: OrderPhase;
  className?: string;
}) {
  const reached = Math.max(0, index) + 1;
  const stalled = phase === "cancelled" || phase === "refunded";

  return (
    <div
      role="progressbar"
      aria-label="Order progress"
      aria-valuemin={0}
      aria-valuemax={stages.length}
      aria-valuenow={stalled ? 0 : reached}
      aria-valuetext={
        stalled ? "Order stopped" : `Step ${reached} of ${stages.length}: ${stages[index]?.label}`
      }
      className={cn("flex items-center gap-1", className)}
    >
      {stages.map((stage, position) => (
        <span
          key={`${stage.status}-${position}`}
          className={cn(
            "h-1.5 flex-1 rounded-full transition-colors duration-500",
            stalled || position >= reached
              ? "bg-border"
              : phase === "delivered"
                ? "bg-emerald-500"
                : "bg-primary",
          )}
        />
      ))}
    </div>
  );
}

const PHASE_ICONS = {
  delivered: CheckCircle2,
  cancelled: XCircle,
  refunded: RotateCcw,
} as const;

/** Square icon tile that stands in for an order thumbnail in list rows. */
export function OrderPhaseIcon({
  phase,
  isPickup,
  className,
}: {
  phase: OrderPhase;
  isPickup?: boolean;
  className?: string;
}) {
  const Icon = phase === "active" ? (isPickup ? Store : Bike) : PHASE_ICONS[phase];

  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-xl border",
        PHASE_TONES[phase],
        className,
      )}
    >
      <Icon className="size-[18px]" aria-hidden />
    </span>
  );
}
