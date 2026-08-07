import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { getRestaurant, money } from "@/lib/data";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your cart — Hearth" },
      {
        name: "description",
        content: "Review your items, apply a promo code, add a tip and see the full price breakdown.",
      },
      { property: "og:title", content: "Your cart — Hearth" },
      {
        property: "og:description",
        content: "Adjust quantities, add coupons and continue to a secure checkout.",
      },
    ],
  }),
  component: CartPage,
});

const tipOptions = [0, 1, 2, 3.5];

function CartPage() {
  const {
    lines,
    restaurantSlug,
    setQty,
    removeLine,
    subtotal,
    deliveryFee,
    serviceFee,
    discount,
    total,
    tip,
    setTip,
    couponCode,
    applyCoupon,
    removeCoupon,
    syncing,
    storage,
  } = useCart();
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const restaurant = restaurantSlug ? getRestaurant(restaurantSlug) : undefined;

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-background md:max-w-2xl">
      <header className="sticky top-0 z-40 md:static flex items-center gap-3 border-b border-border bg-background/90 px-4 py-4 backdrop-blur-md">
        <Link
          to="/"
          aria-label="Back to discover"
          className="grid size-11 place-items-center rounded-full bg-secondary ring-1 ring-border"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <div>
          <h1 className="text-lg leading-none font-black tracking-tight">Your cart</h1>
          <p className="label-mono mt-1 text-muted-foreground">
            {syncing ? "Loading saved cart…" : restaurant ? restaurant.name : "Empty"}
          </p>
        </div>
      </header>

      <div className="px-4 pt-4">
        {storage === "cloud" && user ? (
          <p className="rounded-2xl bg-primary/10 px-4 py-3 text-xs font-bold text-primary ring-1 ring-primary/20">
            Saved to {user.name}'s account — sign out and back in and it'll still be here.
          </p>
        ) : (
          <Link
            to="/login"
            className="block rounded-2xl bg-secondary px-4 py-3 text-xs font-bold ring-1 ring-border"
          >
            Sign in to save this cart to your account →
          </Link>
        )}
      </div>

      {lines.length === 0 ? (
        <main className="px-4 py-16 text-center">
          <p className="text-2xl font-black tracking-tight">Nothing here yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Browse nearby kitchens and your cart will fill up fast.
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex h-14 items-center justify-center rounded-2xl bg-primary px-8 text-sm font-black tracking-[0.1em] text-primary-foreground uppercase"
          >
            Find food
          </Link>
        </main>
      ) : (
        <main className="space-y-8 px-4 pt-6 pb-44 md:pb-24">
          <ul className="space-y-3">
            {lines.map((line) => (
              <li key={line.lineId} className="flex gap-3 rounded-3xl bg-card p-3 ring-1 ring-border">
                <img
                  src={line.image}
                  alt={line.name}
                  width={1024}
                  height={640}
                  loading="lazy"
                  className="size-20 shrink-0 rounded-2xl object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-tight font-bold">{line.name}</p>
                  <p className="label-mono mt-1 text-muted-foreground">
                    {line.sizeLabel}
                    {line.extras.length ? ` • ${line.extras.join(", ")}` : ""}
                  </p>
                  {line.removed.length ? (
                    <p className="label-mono mt-1 text-destructive">No {line.removed.join(", ")}</p>
                  ) : null}
                  {line.notes ? (
                    <p className="mt-1 text-xs text-muted-foreground italic">“{line.notes}”</p>
                  ) : null}
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-1 rounded-xl bg-secondary px-1 ring-1 ring-border">
                      <button
                        type="button"
                        onClick={() => setQty(line.lineId, line.qty - 1)}
                        aria-label={`Decrease ${line.name}`}
                        className="grid size-9 place-items-center rounded-lg"
                      >
                        <Minus className="size-3.5" aria-hidden />
                      </button>
                      <span className="w-5 text-center font-mono text-sm font-bold">{line.qty}</span>
                      <button
                        type="button"
                        onClick={() => setQty(line.lineId, line.qty + 1)}
                        aria-label={`Increase ${line.name}`}
                        className="grid size-9 place-items-center rounded-lg"
                      >
                        <Plus className="size-3.5" aria-hidden />
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-bold">
                        {money(line.unitPrice * line.qty)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeLine(line.lineId)}
                        aria-label={`Remove ${line.name}`}
                        className="grid size-9 place-items-center rounded-lg text-muted-foreground"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <section>
            <h2 className="label-mono mb-3 text-muted-foreground">Promo code</h2>
            {couponCode ? (
              <div className="flex h-12 items-center justify-between rounded-2xl bg-primary/10 px-4 ring-1 ring-primary/30">
                <span className="font-mono text-sm font-bold text-primary">{couponCode}</span>
                <button
                  type="button"
                  onClick={removeCoupon}
                  className="text-[11px] font-black tracking-widest uppercase"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  aria-label="Promo code"
                  placeholder="HEARTH50"
                  maxLength={20}
                  className="h-12 flex-1 rounded-2xl bg-secondary px-4 font-mono text-sm uppercase ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (applyCoupon(code)) {
                      toast.success("Coupon applied");
                      setCode("");
                    } else {
                      toast.error("That code isn't valid");
                    }
                  }}
                  className="h-12 rounded-2xl bg-foreground px-5 text-[11px] font-black tracking-widest text-background uppercase"
                >
                  Apply
                </button>
              </div>
            )}
          </section>

          <section>
            <h2 className="label-mono mb-3 text-muted-foreground">Tip your driver</h2>
            <div className="grid grid-cols-4 gap-2">
              {tipOptions.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setTip(amount)}
                  aria-pressed={tip === amount}
                  className={`h-12 rounded-2xl text-sm font-bold ring-1 ${
                    tip === amount
                      ? "bg-primary/10 text-primary ring-primary/30"
                      : "bg-secondary ring-border"
                  }`}
                >
                  {amount === 0 ? "None" : money(amount)}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-2 rounded-3xl bg-secondary p-5 ring-1 ring-border">
            <Row label="Subtotal" value={money(subtotal)} />
            <Row label="Delivery" value={deliveryFee === 0 ? "Free" : money(deliveryFee)} />
            <Row label="Service fee" value={money(serviceFee)} />
            {tip > 0 ? <Row label="Driver tip" value={money(tip)} /> : null}
            {discount > 0 ? <Row label="Discount" value={`-${money(discount)}`} accent /> : null}
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <span className="text-sm font-black tracking-widest uppercase">Total</span>
              <span className="font-mono text-lg font-black">{money(total)}</span>
            </div>
          </section>
        </main>
      )}

      {lines.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md md:max-w-2xl border-t border-border bg-background/95 px-4 pt-4 pb-7 backdrop-blur">
          <Link
            to="/checkout"
            className="flex h-16 w-full items-center justify-between rounded-3xl bg-primary px-6 text-primary-foreground shadow-2xl shadow-primary/30 transition-transform active:scale-[0.98]"
          >
            <span className="text-sm font-black tracking-[0.1em] uppercase">Checkout</span>
            <span className="font-mono font-bold">{money(total)}</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono font-bold ${accent ? "text-primary" : ""}`}>{value}</span>
    </div>
  );
}
