import { Link } from "@tanstack/react-router";
import { ChevronRight, ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart";
import { money } from "@/lib/data";

export function CartBar() {
  const { itemCount, subtotal, currentRestaurantName } = useCart();
  if (itemCount === 0) return null;

  const itemLabel = `${itemCount} ${itemCount === 1 ? "item" : "items"}`;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-24 md:pb-6">
      <Link
        to="/cart"
        aria-label={`View cart — ${itemLabel}${
          currentRestaurantName ? ` from ${currentRestaurantName}` : ""
        }, subtotal ${money(subtotal)}`}
        className="animate-cart-bar pointer-events-auto flex h-16 w-full max-w-sm items-center gap-3 rounded-[26px] bg-primary pr-4 pl-3 text-primary-foreground ring-1 ring-primary-foreground/15 ring-inset shadow-2xl shadow-primary/45 transition-all duration-200 hover:bg-primary/95 hover:shadow-primary/55 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground md:max-w-md"
      >
        <span className="relative grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-foreground/20 ring-1 ring-primary-foreground/20 ring-inset">
          <ShoppingBag className="size-[18px]" aria-hidden />
          <span
            aria-hidden
            className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-background px-1 font-mono text-[10px] leading-none font-black text-primary ring-2 ring-primary"
          >
            {itemCount}
          </span>
        </span>

        <span className="min-w-0 flex-1 text-left">
          <span className="block text-[13px] leading-tight font-black tracking-wider uppercase">
            View cart
          </span>
          <span className="block truncate text-[11px] leading-tight opacity-85">
            {itemLabel}
            {currentRestaurantName ? ` · ${currentRestaurantName}` : ""}
          </span>
        </span>

        <span aria-hidden className="h-8 w-px shrink-0 bg-primary-foreground/20" />

        <span className="flex shrink-0 items-center gap-0.5">
          <span className="font-mono text-[15px] font-bold tabular-nums">{money(subtotal)}</span>
          <ChevronRight className="size-4 opacity-70" aria-hidden />
        </span>
      </Link>
    </div>
  );
}
