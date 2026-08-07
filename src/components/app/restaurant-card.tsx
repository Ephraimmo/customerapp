import { Link } from "@tanstack/react-router";
import type { Restaurant } from "@/lib/data";
import { money } from "@/lib/data";

export function RestaurantCard({
  restaurant,
  delayMs = 0,
  priority = false,
}: {
  restaurant: Restaurant;
  delayMs?: number;
  priority?: boolean;
}) {
  const [minEta, maxEta] = restaurant.etaMinutes;

  return (
    <Link
      to="/restaurant/$slug"
      params={{ slug: restaurant.slug }}
      className="group block animate-[var(--animate-slide-up)]"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="relative mb-3 aspect-[16/10] overflow-hidden rounded-[28px] bg-secondary">
        <img
          src={restaurant.image}
          alt={`${restaurant.name} — ${restaurant.tagline}`}
          width={1024}
          height={640}
          loading={priority ? "eager" : "lazy"}
          className="size-full object-cover transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:scale-[1.03]"
        />
        {restaurant.badge ? (
          <span className="absolute top-4 left-4 rounded-full bg-background/95 px-3 py-1.5 text-[10px] font-black tracking-widest uppercase ring-1 ring-border backdrop-blur-sm">
            {restaurant.badge}
          </span>
        ) : null}
        <span
          className={`absolute right-4 bottom-4 grid size-12 place-items-center rounded-2xl text-sm font-bold shadow-xl ${
            restaurant.rating >= 4.7
              ? "bg-primary text-primary-foreground"
              : "bg-foreground text-background"
          }`}
        >
          {restaurant.rating}
        </span>
      </div>
      <div className="flex items-start justify-between gap-3 px-1">
        <div>
          <h3 className="text-lg leading-tight font-bold transition-colors group-hover:text-primary">
            {restaurant.name}
          </h3>
          <p className="text-sm text-muted-foreground">
            {restaurant.tagline} • {restaurant.priceBand}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-black">
            {minEta}–{maxEta} min
          </p>
          <p className="label-mono text-muted-foreground">
            {restaurant.deliveryFee === 0
              ? "Free delivery"
              : `Delivery ${money(restaurant.deliveryFee)}`}
          </p>
        </div>
      </div>
    </Link>
  );
}
