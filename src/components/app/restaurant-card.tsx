import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Bike, Clock, Compass, MapPin, Store } from "lucide-react";
import type { Restaurant } from "@/lib/data";
import { money } from "@/lib/data";
import { useLocation } from "@/lib/location";
import { restaurantOffersDelivery, restaurantOffersPickup } from "@/lib/pricing";
import { getClosestBranch } from "@/lib/branch-selector";

export function RestaurantCard({
  restaurant,
  delayMs = 0,
  priority = false,
}: {
  restaurant: Restaurant;
  delayMs?: number;
  priority?: boolean;
}) {
  const { activeLocation, gpsCoordinates } = useLocation();

  const customerCoords = useMemo(() => {
    if (activeLocation && activeLocation.latitude != null && activeLocation.longitude != null) {
      return { latitude: activeLocation.latitude, longitude: activeLocation.longitude };
    }
    if (gpsCoordinates && gpsCoordinates.latitude != null && gpsCoordinates.longitude != null) {
      return { latitude: gpsCoordinates.latitude, longitude: gpsCoordinates.longitude };
    }
    return { latitude: -26.1952, longitude: 28.0345 };
  }, [activeLocation, gpsCoordinates]);

  // Evaluate closest branch among main branch + all sub-branches (§4 & §5 of Contract)
  const branchInfo = useMemo(() => {
    return getClosestBranch(restaurant, customerCoords, "delivery");
  }, [restaurant, customerCoords]);

  const { closestBranch, distanceKm, isDeliveryEligible, deliveryFee, allBranchesCount } = branchInfo;

  const hasDelivery = restaurantOffersDelivery(restaurant);
  const hasPickup = restaurantOffersPickup(restaurant);
  const isOutOfRange = hasDelivery && !isDeliveryEligible;

  // Live ETA based on prep time + travel time (0.5 km/min) from closest branch
  const etaRange = useMemo<[number, number]>(() => {
    const prep = restaurant.prep_time_minutes ?? restaurant.etaMinutes[0] ?? 20;
    if (distanceKm != null && Number.isFinite(distanceKm)) {
      const travel = Math.ceil(distanceKm / 0.5);
      return [prep + travel, prep + travel + 12];
    }
    return restaurant.etaMinutes;
  }, [restaurant, distanceKm]);

  // Color-coded fee tier badge
  const feeBadgeColor = useMemo(() => {
    if (isOutOfRange) return "bg-destructive/15 text-destructive ring-destructive/30";
    if (!hasDelivery) return "bg-amber-500/15 text-amber-600 ring-amber-500/30";
    if (deliveryFee === 0) return "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30 font-bold";
    if (deliveryFee <= 15) return "bg-emerald-500/10 text-emerald-600 ring-emerald-500/25";
    if (deliveryFee <= 25) return "bg-primary/10 text-primary ring-primary/25";
    return "bg-amber-500/10 text-amber-600 ring-amber-500/25";
  }, [isOutOfRange, hasDelivery, deliveryFee]);

  const displayDistance =
    distanceKm != null && Number.isFinite(distanceKm)
      ? `${distanceKm.toFixed(1)} km`
      : `${(restaurant?.distanceKm || 1.8).toFixed(1)} km`;

  // Show closest branch name if sub-branch or multiple branches exist (§5)
  const showBranchLabel = allBranchesCount > 1 || (closestBranch && closestBranch.id !== "main");
  const branchDisplayName = closestBranch?.name || restaurant.name;

  return (
    <Link
      to="/restaurant/$slug"
      params={{ slug: restaurant.slug }}
      className="group block animate-[var(--animate-slide-up)]"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="relative mb-3 aspect-[16/10] overflow-hidden rounded-[28px] bg-secondary border border-border/60">
        <img
          src={restaurant.image}
          alt={`${restaurant.name} — ${restaurant.tagline}`}
          width={1024}
          height={640}
          loading={priority ? "eager" : "lazy"}
          className="size-full object-cover transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:scale-[1.03]"
        />
        {restaurant.badge ? (
          <span className="absolute top-4 left-4 rounded-full bg-background/95 px-3 py-1.5 text-[10px] font-black tracking-widest uppercase ring-1 ring-border backdrop-blur-sm shadow-md">
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

      <div className="space-y-2 px-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg leading-tight font-bold text-foreground transition-colors group-hover:text-primary truncate">
              {restaurant.name}
            </h3>

            {/* Display closest branch name (§5 of Contract) */}
            {showBranchLabel ? (
              <p className="text-xs font-bold text-primary mt-0.5 flex items-center gap-1 truncate">
                <Store className="size-3 shrink-0" />
                <span>{branchDisplayName}</span>
              </p>
            ) : null}

            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {restaurant.tagline} • {restaurant.priceBand}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-black text-foreground">
              {etaRange[0]}–{etaRange[1]} min
            </p>
          </div>
        </div>

        {/* Live Delivery Info Strip */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span
            aria-label={`Distance ${displayDistance}`}
            className="flex items-center gap-1 rounded-lg bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground ring-1 ring-border"
          >
            <Compass className="size-3 text-primary" />
            {displayDistance}
          </span>

          {isOutOfRange ? (
            <span
              aria-label="Too far for delivery"
              className="rounded-lg bg-destructive/15 px-2 py-0.5 text-[11px] font-black uppercase text-destructive ring-1 ring-destructive/30"
            >
              Too far ({displayDistance})
            </span>
          ) : !hasDelivery ? (
            <span
              aria-label="Pickup only"
              className="rounded-lg bg-amber-500/15 px-2 py-0.5 text-[11px] font-black uppercase text-amber-600 ring-1 ring-amber-500/30"
            >
              Pickup only
            </span>
          ) : (
            <span
              aria-label={`Delivery fee ${money(deliveryFee)}`}
              className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-bold ring-1 ${feeBadgeColor}`}
            >
              <Bike className="size-3" />
              {deliveryFee === 0 ? "Free delivery" : `Delivery ${money(deliveryFee)}`}
            </span>
          )}

          {restaurant.minOrder ? (
            <span className="text-[11px] text-muted-foreground ml-auto font-mono">
              min {money(restaurant.minOrder)}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
