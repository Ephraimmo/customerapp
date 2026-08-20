import { Link } from "@tanstack/react-router";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart";
import { money } from "@/lib/data";

export function CartBar() {
  const { itemCount, subtotal, currentRestaurantName } = useCart();
  if (itemCount === 0) return null;

  return (
    <div className="fixed bottom-24 left-1/2 z-50 w-[calc(100%-32px)] max-w-sm -translate-x-1/2 md:bottom-6">
      <Link
        to="/cart"
        className="flex h-16 w-full items-center justify-between rounded-3xl bg-primary px-5 text-primary-foreground shadow-2xl shadow-primary/40 transition-transform active:scale-[0.98] hover:bg-primary/95"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative grid size-9 place-items-center rounded-xl bg-primary-foreground/15 shrink-0">
            <ShoppingBag className="size-4" />
            <span className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-foreground text-[9px] font-black text-background">
              {itemCount}
            </span>
          </div>
          <div className="min-w-0 text-left">
            <span className="text-xs font-black tracking-wide uppercase block truncate leading-tight">
              View Cart
            </span>
            {currentRestaurantName && (
              <span className="text-[10px] opacity-85 block truncate max-w-[140px]">
                {currentRestaurantName}
              </span>
            )}
          </div>
        </div>

        <span className="font-mono font-bold text-sm shrink-0">{money(subtotal)}</span>
      </Link>
    </div>
  );
}
