import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Apple, Banknote, CreditCard, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { getRestaurant, money } from "@/lib/data";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — Hearth" },
      {
        name: "description",
        content: "Confirm your delivery address, choose a payment method and place your order.",
      },
      { property: "og:title", content: "Checkout — Hearth" },
      {
        property: "og:description",
        content: "Delivery or pickup, saved cards, wallet or cash — checkout in a couple of taps.",
      },
    ],
  }),
  component: CheckoutPage,
});

const addresses = [
  { id: "home", label: "Home", value: "242 High Street, St. Ives" },
  { id: "work", label: "Work", value: "Unit 4, Anchor Works, Harbour Rd" },
];

const payments = [
  { id: "card", label: "Visa •••• 4242", icon: CreditCard },
  { id: "apple", label: "Apple Pay", icon: Apple },
  { id: "wallet", label: "Hearth Wallet — £18.40", icon: Wallet },
  { id: "cash", label: "Cash on delivery", icon: Banknote },
];

function CheckoutPage() {
  const navigate = useNavigate();
  const { lines, restaurantSlug, subtotal, deliveryFee, serviceFee, discount, tip, total, placeOrder } =
    useCart();
  const { user } = useAuth();
  const restaurant = restaurantSlug ? getRestaurant(restaurantSlug) : undefined;

  const [mode, setMode] = useState<"delivery" | "pickup">("delivery");
  const [addressId, setAddressId] = useState("home");
  const [paymentId, setPaymentId] = useState("card");
  const [instructions, setInstructions] = useState("");
  const [placing, setPlacing] = useState(false);

  if (lines.length === 0) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-md px-4 md:max-w-2xl py-20 text-center">
        <h1 className="text-2xl font-black tracking-tight">Your cart is empty</h1>
        <Link
          to="/"
          className="mt-6 inline-flex h-14 items-center rounded-2xl bg-primary px-8 text-sm font-black tracking-[0.1em] text-primary-foreground uppercase"
        >
          Find food
        </Link>
      </div>
    );
  }

  const address = addresses.find((a) => a.id === addressId) ?? addresses[0]!;

  function submit() {
    setPlacing(true);
    const order = placeOrder({
      address: mode === "pickup" ? (restaurant?.address ?? "Pickup") : address.value,
      mode,
    });
    toast.success("Order placed", { description: `Reference ${order.id}` });
    void navigate({ to: "/orders/$orderId", params: { orderId: order.id } });
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-background md:max-w-2xl">
      <header className="sticky top-0 z-40 md:static flex items-center gap-3 border-b border-border bg-background/90 px-4 py-4 backdrop-blur-md">
        <Link
          to="/cart"
          aria-label="Back to cart"
          className="grid size-11 place-items-center rounded-full bg-secondary ring-1 ring-border"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <div>
          <h1 className="text-lg leading-none font-black tracking-tight">Checkout</h1>
          <p className="label-mono mt-1 text-muted-foreground">{restaurant?.name}</p>
        </div>
      </header>

      <main className="space-y-8 px-4 pt-6 pb-44 md:pb-24">
        <section className="rounded-2xl bg-secondary p-4 ring-1 ring-border">
          {user ? (
            <>
              <span className="label-mono text-muted-foreground">Ordering as</span>
              <p className="mt-1 text-sm font-bold">{user.name}</p>
              <p className="label-mono mt-1 text-muted-foreground">
                {user.email} • {user.phone}
              </p>
            </>
          ) : (
            <>
              <span className="label-mono text-muted-foreground">Guest checkout</span>
              <Link to="/login" className="mt-1 block text-sm font-bold text-primary">
                Sign in to save your cart and details →
              </Link>
            </>
          )}
        </section>

        <section>
          <h2 className="label-mono mb-3 text-muted-foreground">How would you like it?</h2>
          <div className="grid grid-cols-2 gap-2">
            {(["delivery", "pickup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`h-12 rounded-2xl text-sm font-bold capitalize ring-1 ${
                  mode === m ? "bg-primary/10 text-primary ring-primary/30" : "bg-secondary ring-border"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </section>

        {mode === "delivery" ? (
          <section>
            <h2 className="label-mono mb-3 text-muted-foreground">Delivery address</h2>
            <div className="space-y-2">
              {addresses.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAddressId(a.id)}
                  aria-pressed={addressId === a.id}
                  className={`w-full rounded-2xl px-4 py-3 text-left ring-1 ${
                    addressId === a.id ? "bg-primary/10 ring-primary/30" : "bg-secondary ring-border"
                  }`}
                >
                  <span className="label-mono text-muted-foreground">{a.label}</span>
                  <span className="mt-1 block text-sm font-bold">{a.value}</span>
                </button>
              ))}
            </div>
            <label htmlFor="instructions" className="label-mono mt-4 mb-2 block text-muted-foreground">
              Delivery instructions
            </label>
            <textarea
              id="instructions"
              rows={2}
              maxLength={200}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Leave at the blue door, ring the bell."
              className="w-full resize-none rounded-2xl bg-secondary px-4 py-3 text-sm ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/30"
            />
          </section>
        ) : (
          <section className="rounded-2xl bg-secondary p-4 ring-1 ring-border">
            <span className="label-mono text-muted-foreground">Collect from</span>
            <p className="mt-1 text-sm font-bold">{restaurant?.address}</p>
            <p className="label-mono mt-2 text-muted-foreground">{restaurant?.hours}</p>
          </section>
        )}

        <section>
          <h2 className="label-mono mb-3 text-muted-foreground">Payment method</h2>
          <div className="space-y-2">
            {payments.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setPaymentId(id)}
                aria-pressed={paymentId === id}
                className={`flex h-14 w-full items-center gap-3 rounded-2xl px-4 text-sm font-bold ring-1 ${
                  paymentId === id ? "bg-primary/10 text-primary ring-primary/30" : "bg-secondary ring-border"
                }`}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2 rounded-3xl bg-secondary p-5 ring-1 ring-border">
          <h2 className="label-mono mb-2 text-muted-foreground">Order summary</h2>
          {lines.map((l) => (
            <div key={l.lineId} className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {l.qty}× {l.name}
              </span>
              <span className="font-mono font-bold">{money(l.unitPrice * l.qty)}</span>
            </div>
          ))}
          <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
            <SummaryRow label="Subtotal" value={money(subtotal)} />
            {mode === "delivery" ? (
              <SummaryRow label="Delivery" value={deliveryFee === 0 ? "Free" : money(deliveryFee)} />
            ) : null}
            <SummaryRow label="Service fee" value={money(serviceFee)} />
            {tip > 0 ? <SummaryRow label="Driver tip" value={money(tip)} /> : null}
            {discount > 0 ? <SummaryRow label="Discount" value={`-${money(discount)}`} /> : null}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm font-black tracking-widest uppercase">Total</span>
            <span className="font-mono text-lg font-black">
              {money(mode === "pickup" ? total - deliveryFee : total)}
            </span>
          </div>
          <p className="label-mono mt-3 text-muted-foreground">
            Arrives in {restaurant?.etaMinutes[0]}–{restaurant?.etaMinutes[1]} min
          </p>
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md md:max-w-2xl border-t border-border bg-background/95 px-4 pt-4 pb-7 backdrop-blur">
        <button
          type="button"
          onClick={submit}
          disabled={placing}
          className="flex h-16 w-full items-center justify-between rounded-3xl bg-primary px-6 text-primary-foreground shadow-2xl shadow-primary/30 transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          <span className="text-sm font-black tracking-[0.1em] uppercase">
            {placing ? "Placing…" : "Place order"}
          </span>
          <span className="font-mono font-bold">
            {money(mode === "pickup" ? total - deliveryFee : total)}
          </span>
        </button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-bold">{value}</span>
    </div>
  );
}
