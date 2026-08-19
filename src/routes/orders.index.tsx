import { createFileRoute, Link } from "@tanstack/react-router";
import { BottomNav } from "@/components/app/bottom-nav";
import { CartBar } from "@/components/app/cart-bar";
import { useCart } from "@/lib/cart";
import { money } from "@/lib/data";

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

function OrdersPage() {
  const { orders } = useCart();

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-background md:max-w-2xl">
      <header className="sticky top-0 z-40 md:static border-b border-border bg-background/90 px-4 py-5 backdrop-blur-md">
        <h1 className="text-2xl leading-none font-black tracking-tight">Orders</h1>
      </header>

      <main className="space-y-3 px-4 pt-6 pb-44 md:pb-24">
        {orders.length === 0 ? (
          <div className="rounded-3xl bg-secondary p-8 text-center ring-1 ring-border">
            <p className="text-lg font-black">No orders yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Orders you place will appear here with live tracking directly from the kitchen.
            </p>
            <Link
              to="/"
              className="mt-6 inline-flex h-12 items-center rounded-2xl bg-primary px-6 text-[11px] font-black tracking-widest text-primary-foreground uppercase"
            >
              Start an order
            </Link>
          </div>
        ) : (
          orders.map((order) => {
            if (!order || !order.id) return null;
            const status = (order.status || "pending").toLowerCase();
            const isLive =
              status !== "delivered" && status !== "cancelled" && status !== "refunded";

            return (
              <Link
                key={order.id}
                to="/orders/$orderId"
                params={{ orderId: order.id }}
                className="block rounded-3xl bg-card p-5 ring-1 ring-border hover:bg-card/90 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="label-mono text-muted-foreground font-mono">
                      {order.order_number || order.id}
                    </span>
                    <p className="mt-1 text-base leading-tight font-bold">
                      {order.restaurant_name || "Restaurant"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1.5 text-[10px] font-black tracking-widest uppercase ${
                      status === "delivered"
                        ? "bg-emerald-500/15 text-emerald-600"
                        : status === "cancelled"
                          ? "bg-destructive/15 text-destructive"
                          : status === "refunded"
                            ? "bg-amber-500/15 text-amber-600"
                            : "bg-primary/10 text-primary"
                    }`}
                  >
                    {isLive ? `Live • ${status.replace(/_/g, " ")}` : status.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {order.placed_at
                    ? new Date(order.placed_at).toLocaleString([], {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "Recent"}
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2">
                  <span className="label-mono text-muted-foreground">
                    {order.payment_method
                      ? `Payment: ${order.payment_method.toUpperCase()}`
                      : "Card"}
                  </span>
                  <span className="font-mono text-sm font-black">{money(order.total || 0)}</span>
                </div>
              </Link>
            );
          })
        )}
      </main>

      <CartBar />
      <BottomNav />
    </div>
  );
}
