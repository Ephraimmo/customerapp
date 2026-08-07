import { createFileRoute, Link } from "@tanstack/react-router";
import { BottomNav } from "@/components/app/bottom-nav";
import { CartBar } from "@/components/app/cart-bar";
import { currentStage, stageCopy, useCart } from "@/lib/cart";
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
  const now = Date.now();

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
              Your first delivery will show up here with live tracking.
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
            const stage = currentStage(order, now);
            const live = stage !== "delivered";
            return (
              <Link
                key={order.id}
                to="/orders/$orderId"
                params={{ orderId: order.id }}
                className="block rounded-3xl bg-card p-5 ring-1 ring-border"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="label-mono text-muted-foreground">{order.id}</span>
                    <p className="mt-1 text-base leading-tight font-bold">{order.restaurantName}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1.5 text-[10px] font-black tracking-widest uppercase ${
                      live ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {live ? "Live" : "Delivered"}
                  </span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{stageCopy[stage].title}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="label-mono text-muted-foreground">
                    {order.lines.reduce((s, l) => s + l.qty, 0)} items
                  </span>
                  <span className="font-mono text-sm font-black">{money(order.total)}</span>
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
