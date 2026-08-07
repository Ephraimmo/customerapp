import { Link } from "@tanstack/react-router";
import { useCart } from "@/lib/cart";
import { money } from "@/lib/data";

export function CartBar() {
  const { itemCount, subtotal } = useCart();
  if (itemCount === 0) return null;

  return (
    <div className="fixed bottom-24 left-1/2 z-50 w-[calc(100%-32px)] max-w-sm -translate-x-1/2 md:bottom-6">
      <Link
        to="/cart"
        className="flex h-16 w-full items-center justify-between rounded-3xl bg-primary px-6 text-primary-foreground shadow-2xl shadow-primary/40 transition-transform active:scale-[0.98]"
      >
        <span className="flex items-baseline gap-2">
          <span className="label-mono opacity-80">Items</span>
          <span className="text-xl font-black">{itemCount}</span>
        </span>
        <span className="text-sm font-black tracking-[0.1em] uppercase">View Cart</span>
        <span className="font-mono font-bold">{money(subtotal)}</span>
      </Link>
    </div>
  );
}
