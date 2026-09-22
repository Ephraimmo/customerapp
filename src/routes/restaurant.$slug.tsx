import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Bike,
  Clock,
  Compass,
  Flame,
  Heart,
  MapPin,
  Plus,
  Sparkles,
  Star,
  Store,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";
import { CartBar } from "@/components/app/cart-bar";
import { DishSheet } from "@/components/app/dish-sheet";
import { LocationSelectorDialog } from "@/components/app/location-selector-dialog";
import { money, type Dish } from "@/lib/data";
import {
  useBranchMenuAvailability,
  useComboDeals,
  useRestaurant,
  useRestaurantBranches,
} from "@/lib/firebase-adapters";
import { useLocation } from "@/lib/location";
import { useCart } from "@/lib/cart";
import { quoteDelivery, restaurantOffersDelivery, restaurantOffersPickup } from "@/lib/pricing";
import { haversineDistanceKm } from "@/lib/geo";
import { selectBestBranch } from "@/lib/branch-selector";

/** One cell of the header info bar. Keeps value/label baselines aligned
 *  across tiles even when a tile carries a trailing action. */
function StatTile({
  icon,
  value,
  label,
  action,
}: {
  icon: ReactNode;
  value: ReactNode;
  label: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col justify-between rounded-2xl bg-secondary p-3 ring-1 ring-border">
      <span className="flex items-center gap-1.5 text-sm leading-tight font-black text-foreground">
        {icon}
        <span className="min-w-0 truncate">{value}</span>
      </span>
      <span className="mt-1.5 flex items-center justify-between gap-2">
        <span className="label-mono min-w-0 truncate text-muted-foreground">{label}</span>
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className="label-mono shrink-0 cursor-pointer text-primary transition-opacity hover:opacity-70"
          >
            {action.label}
          </button>
        ) : null}
      </span>
    </div>
  );
}

/** Shown while the live menu is still resolving, so the page keeps its
 *  shape instead of flashing a bare message. */
function MenuSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading menu"
      className="mx-auto min-h-screen w-full max-w-full animate-pulse bg-background sm:max-w-[640px] md:max-w-3xl lg:max-w-6xl"
    >
      <div className="aspect-[16/10] w-full bg-secondary md:aspect-[21/9] md:max-h-[380px] md:rounded-b-[32px]" />
      <div className="space-y-4 px-4 pt-5">
        <div className="h-7 w-2/3 rounded-lg bg-secondary" />
        <div className="h-4 w-1/2 rounded-lg bg-secondary" />
        <div className="h-14 w-full rounded-2xl bg-secondary" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-secondary" />
          ))}
        </div>
        <div className="grid gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[120px] rounded-3xl bg-secondary" />
          ))}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/restaurant/$slug")({
  head: ({ params }) => {
    const title = "Restaurant menu — order delivery on Hearth";
    const description = `Browse the live menu for ${params.slug.replace(/-/g, " ")} and order delivery on Hearth.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: RestaurantPage,
});

function RestaurantPage() {
  const { slug } = Route.useParams();
  const { restaurant, loading } = useRestaurant(slug);
  const { activeLocation, gpsCoordinates } = useLocation();
  const { mode, setMode, lines, hasConflict, currentRestaurantName, itemCount } = useCart();
  const combos = useComboDeals(restaurant?.slug || slug);

  // Live branches from Firebase RTDB (§7)
  const { branches } = useRestaurantBranches(restaurant?.id || slug);

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sheetDish, setSheetDish] = useState<Dish | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [openLocationDialog, setOpenLocationDialog] = useState(false);

  const isCartConflict = restaurant ? hasConflict(restaurant.slug) : false;

  const customerCoords = useMemo(() => {
    if (activeLocation && activeLocation.latitude != null && activeLocation.longitude != null) {
      return { latitude: activeLocation.latitude, longitude: activeLocation.longitude };
    }
    if (gpsCoordinates && gpsCoordinates.latitude != null && gpsCoordinates.longitude != null) {
      return { latitude: gpsCoordinates.latitude, longitude: gpsCoordinates.longitude };
    }
    return { latitude: -26.1952, longitude: 28.0345 };
  }, [activeLocation, gpsCoordinates]);

  const restaurantCoords = useMemo(() => {
    if (restaurant && restaurant.latitude != null && restaurant.longitude != null) {
      return { latitude: restaurant.latitude, longitude: restaurant.longitude };
    }
    return { latitude: -26.1755, longitude: 28.0273 };
  }, [restaurant]);

  // Automatic branch selection per §14 & §15 of Multi-Branch Integration Contract
  const branchSelection = useMemo(() => {
    if (!restaurant)
      return {
        ok: false as const,
        reason: "restaurant_unavailable" as const,
        message: "Loading...",
      };
    return selectBestBranch({
      restaurant,
      branches,
      destinationCoords: customerCoords,
      mode,
    });
  }, [restaurant, branches, customerCoords, mode]);

  const activeBranch = branchSelection.ok ? branchSelection.branch : null;

  // Branch-specific menu item overlay (§19)
  const { isItemAvailable } = useBranchMenuAvailability(restaurant?.id || slug, activeBranch?.id);

  // Real-time Delivery Quote based on selected branch and tiers
  const quote = useMemo(() => {
    if (mode === "pickup") {
      return { isWithinRange: true, distanceKm: null, fee: 0, minOrder: restaurant?.minOrder ?? 0 };
    }
    if (!branchSelection.ok) {
      return {
        isWithinRange: false,
        distanceKm: null,
        fee: 0,
        minOrder: restaurant?.minOrder ?? 0,
        reason:
          branchSelection.reason === "invalid_destination" ? "no-customer-coords" : "out-of-range",
      };
    }
    return {
      isWithinRange: true,
      distanceKm: branchSelection.distanceKm,
      fee: branchSelection.deliveryFee,
      minOrder: restaurant?.minOrder ?? 0,
    };
  }, [restaurant, mode, branchSelection]);

  // Compute straight-line distance in kilometres from selected branch or parent
  const displayDistance = useMemo<string>(() => {
    if (branchSelection.ok && branchSelection.distanceKm != null) {
      return `${branchSelection.distanceKm.toFixed(1)} km`;
    }
    if (quote.distanceKm != null && Number.isFinite(quote.distanceKm)) {
      return `${quote.distanceKm.toFixed(1)} km`;
    }
    const dist = haversineDistanceKm(restaurantCoords, customerCoords);
    if (dist != null) {
      return `${dist.toFixed(1)} km`;
    }
    return `${(restaurant?.distanceKm || 1.8).toFixed(1)} km`;
  }, [branchSelection, quote.distanceKm, restaurantCoords, customerCoords, restaurant?.distanceKm]);

  const hasDelivery = restaurantOffersDelivery(restaurant);
  const hasPickup = restaurantOffersPickup(restaurant);
  const isOutOfRange =
    mode === "delivery" &&
    !branchSelection.ok &&
    branchSelection.reason === "outside_delivery_area";
  const needsAddress = mode === "delivery" && !activeLocation && !gpsCoordinates;

  // Auto-switch to pickup if delivery is disabled by admin console
  useEffect(() => {
    if (restaurant && !hasDelivery && mode === "delivery") {
      setMode("pickup");
      toast.message("This restaurant doesn't offer delivery right now — switched to pickup.");
    }
  }, [restaurant?.slug, hasDelivery, mode, setMode]);

  const etaMinutes = useMemo<[number, number]>(() => {
    const prep = restaurant?.prep_time_minutes ?? restaurant?.etaMinutes[0] ?? 20;
    const distanceKm = branchSelection.ok ? branchSelection.distanceKm : quote.distanceKm;
    if (mode === "pickup" || distanceKm == null) {
      return [prep, prep + 10];
    }
    const travel = Math.ceil(distanceKm / 0.5);
    return [prep + travel, prep + travel + 12];
  }, [restaurant, mode, branchSelection, quote.distanceKm]);

  if (!restaurant) {
    if (loading) return <MenuSkeleton />;

    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 py-24 text-center md:max-w-3xl">
        <div className="grid size-16 place-items-center rounded-3xl bg-secondary text-muted-foreground ring-1 ring-border">
          <UtensilsCrossed className="size-7" aria-hidden />
        </div>
        <p className="mt-5 text-2xl font-black tracking-tight">Restaurant unavailable</p>
        <p className="mt-2 text-sm text-muted-foreground">
          This kitchen isn't published right now.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex h-11 items-center rounded-2xl bg-primary px-5 text-xs font-black tracking-wider text-primary-foreground uppercase transition-colors hover:bg-primary/90"
        >
          Back to discover
        </Link>
      </div>
    );
  }

  const currentCategory =
    activeCategory && (restaurant.categories || []).includes(activeCategory)
      ? activeCategory
      : (restaurant.categories?.[0] ?? "Menu");

  // Filter visible dishes with branch-level menu availability overlay (§19)
  const availableDishes = (restaurant.dishes || []).filter((d) =>
    isItemAvailable(d.id, d.is_available !== false),
  );
  const countFor = (cat: string) =>
    cat === "Popular"
      ? availableDishes.filter((d) => d.popular).length
      : availableDishes.filter((d) => d.category === cat).length;

  const visible =
    currentCategory === "Popular"
      ? availableDishes.filter((d) => d.popular)
      : availableDishes.filter((d) => d.category === currentCategory);

  const hasReviews = (restaurant.reviewCount ?? 0) > 0;

  return (
    <div className="mx-auto min-h-screen w-full max-w-full bg-background px-0 sm:max-w-[640px] md:max-w-3xl lg:max-w-6xl">
      {/* Cover Image Header */}
      <div className="relative">
        <div className="relative overflow-hidden bg-secondary md:rounded-b-[32px]">
          <img
            src={restaurant.image}
            alt={`${restaurant.name} kitchen`}
            width={1024}
            height={640}
            className="aspect-[16/10] w-full object-cover md:aspect-[21/9] md:max-h-[380px]"
          />
          {/* Softens the hard cut where the cover meets the page. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent"
          />
        </div>

        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
          <Link
            to="/"
            aria-label="Back to discover"
            className="grid size-11 cursor-pointer place-items-center rounded-full bg-background/85 text-foreground shadow-sm ring-1 ring-border backdrop-blur-md transition-colors hover:bg-background"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={() => setFavorite((v) => !v)}
            aria-label={favorite ? "Remove from favorites" : "Save to favorites"}
            aria-pressed={favorite}
            className="grid size-11 cursor-pointer place-items-center rounded-full bg-background/85 text-foreground shadow-sm ring-1 ring-border backdrop-blur-md transition-colors hover:bg-background"
          >
            <Heart
              className={`size-4 transition-transform ${favorite ? "scale-110 fill-primary text-primary" : ""}`}
              aria-hidden
            />
          </button>
        </div>
      </div>

      <main className="pb-44 md:pb-24">
        <header className="px-4 pt-5 space-y-4">
          <div>
            <h1 className="text-2xl leading-tight font-black tracking-tight">{restaurant.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {restaurant.tagline} • {restaurant.priceBand}
            </p>
          </div>

          {/* Delivery / Pickup Segmented Control */}
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-1 ring-1 ring-border">
            <button
              type="button"
              disabled={!hasDelivery}
              onClick={() => setMode("delivery")}
              title={!hasDelivery ? "This restaurant doesn't offer delivery" : undefined}
              className={`flex h-11 items-center justify-center gap-2 rounded-xl text-xs font-black tracking-wider uppercase transition-all cursor-pointer ${
                mode === "delivery" && hasDelivery
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-muted-foreground hover:text-foreground"
              } ${!hasDelivery ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <Bike className="size-4" />
              Delivery
            </button>
            <button
              type="button"
              disabled={!hasPickup}
              onClick={() => setMode("pickup")}
              className={`flex h-11 items-center justify-center gap-2 rounded-xl text-xs font-black tracking-wider uppercase transition-all cursor-pointer ${
                mode === "pickup" || !hasDelivery
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MapPin className="size-4" />
              Pickup
            </button>
          </div>

          {/* 4-Stat Info Bar */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile
              icon={<Star className="size-3.5 shrink-0 fill-primary text-primary" aria-hidden />}
              value={hasReviews ? restaurant.rating : "New"}
              label={hasReviews ? `${restaurant.reviewCount} reviews` : "no reviews yet"}
            />

            <StatTile
              icon={<Clock className="size-3.5 shrink-0 text-primary" aria-hidden />}
              value={`${etaMinutes[0]}–${etaMinutes[1]}`}
              label={mode === "pickup" ? "prep minutes" : "arrival minutes"}
            />

            <StatTile
              icon={<Bike className="size-3.5 shrink-0 text-primary" aria-hidden />}
              value={
                mode === "pickup"
                  ? "Free"
                  : isOutOfRange
                    ? "Out of range"
                    : !hasDelivery
                      ? "Pickup only"
                      : quote.fee === 0
                        ? "Free"
                        : money(quote.fee)
              }
              label={mode === "pickup" ? "pickup order" : "delivery fee"}
            />

            <StatTile
              icon={<Compass className="size-3.5 shrink-0 text-primary" aria-hidden />}
              value={displayDistance}
              label={activeLocation?.label || "from you"}
              action={{ label: "Change", onClick: () => setOpenLocationDialog(true) }}
            />
          </div>

          {/* Active Combos on this Restaurant */}
          {combos.length > 0 ? (
            <div className="rounded-2xl bg-primary/10 p-3.5 border border-primary/20 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <span className="font-bold text-primary">
                  {combos.length} Special Deals & Bundles Active
                </span>
              </div>
              <span className="text-[11px] text-primary/80 font-medium">
                Applied automatically in cart
              </span>
            </div>
          ) : null}

          {/* Multi-Branch Passive Attribution Info Card (§2 & §14 of Contract) */}
          {branchSelection.ok && activeBranch ? (
            <div className="rounded-2xl bg-secondary/70 px-4 py-3 border border-border flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
                  <Store className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-foreground truncate">
                    {mode === "delivery"
                      ? `Fulfilled by ${activeBranch.name}`
                      : `Pickup location: ${activeBranch.name}`}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {activeBranch.address || activeBranch.city}
                    {branchSelection.distanceKm != null
                      ? ` • ${branchSelection.distanceKm.toFixed(1)} km away`
                      : ""}
                  </p>
                </div>
              </div>

              {branchSelection.eligibleCandidatesCount > 1 ? (
                <span className="rounded-lg bg-background px-2.5 py-1 text-[10px] font-bold text-muted-foreground shrink-0 border border-border">
                  Closest branch
                </span>
              ) : null}
            </div>
          ) : null}

          {/* Friendly Cart Conflict Notice Banner */}
          {isCartConflict && (
            <div className="rounded-2xl bg-amber-500/10 p-3.5 border border-amber-500/25 flex items-center justify-between text-xs text-amber-800 dark:text-amber-300">
              <div className="flex items-center gap-2.5 min-w-0">
                <Store className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="truncate">
                  Cart currently has {itemCount} {itemCount === 1 ? "item" : "items"} from{" "}
                  <strong>{currentRestaurantName}</strong>
                </span>
              </div>
              <Link
                to="/cart"
                className="shrink-0 font-bold text-primary underline ml-3 hover:text-primary/80"
              >
                View Cart →
              </Link>
            </div>
          )}

          {/* Friendly Info Banners */}
          {needsAddress ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-secondary/80 p-3 ring-1 ring-border">
              <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0">Add a delivery address for live fees and ETA</span>
              </span>
              <button
                type="button"
                onClick={() => setOpenLocationDialog(true)}
                className="shrink-0 cursor-pointer rounded-xl bg-primary px-3 py-2 text-[10px] font-black tracking-wider whitespace-nowrap text-primary-foreground uppercase transition-colors hover:bg-primary/90"
              >
                Set address
              </button>
            </div>
          ) : isOutOfRange ? (
            <div className="rounded-2xl bg-destructive/10 p-3.5 text-xs ring-1 ring-destructive/25">
              <p className="flex items-start gap-2 font-bold text-destructive">
                <MapPin className="size-4 shrink-0" aria-hidden />
                <span>
                  {branchSelection.message ||
                    `You are ${displayDistance} away, which is outside the delivery area.`}
                </span>
              </p>
              <p className="mt-1.5 pl-6 text-muted-foreground">
                Switch to{" "}
                <button
                  type="button"
                  onClick={() => setMode("pickup")}
                  className="cursor-pointer font-bold text-primary underline underline-offset-2"
                >
                  Pickup
                </button>{" "}
                or select another delivery address.
              </p>
            </div>
          ) : !hasDelivery ? (
            <p className="flex items-start gap-2 rounded-2xl bg-amber-500/10 p-3.5 text-xs text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-300">
              <Store className="size-4 shrink-0" aria-hidden />
              <span>
                This restaurant doesn't offer delivery right now. You can still order for pickup at
                the kitchen address.
              </span>
            </p>
          ) : null}

          <p className="label-mono flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
            <span
              className={`flex items-center gap-1.5 font-bold ${
                restaurant.openNow ? "text-success" : "text-destructive"
              }`}
            >
              <span
                aria-hidden
                className={`size-1.5 rounded-full ${
                  restaurant.openNow ? "bg-success" : "bg-destructive"
                }`}
              />
              {restaurant.openNow ? "Open now" : "Closed"}
            </span>
            <span aria-hidden>•</span>
            <span>{restaurant.hours}</span>
            <span aria-hidden>•</span>
            <span>{activeBranch?.address || activeBranch?.city || restaurant.address}</span>
          </p>
        </header>

        {/* Categories Tab Navigation — redundant when the menu has a single section */}
        {restaurant.categories.length > 1 ? (
          <nav
            aria-label="Menu categories"
            className="sticky top-0 z-30 mt-6 border-b border-border bg-background/95 backdrop-blur-md md:top-16"
          >
            <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3 [mask-image:linear-gradient(to_right,#000_calc(100%-28px),transparent)]">
              {restaurant.categories.map((cat) => {
                const active = currentCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    aria-pressed={active}
                    className={`flex flex-shrink-0 cursor-pointer items-center gap-2 rounded-full py-2 pr-3 pl-4 text-[11px] font-black tracking-widest uppercase ring-1 transition-colors ${
                      active
                        ? "bg-foreground text-background ring-transparent"
                        : "bg-secondary ring-border hover:bg-secondary/80"
                    }`}
                  >
                    {cat}
                    <span
                      className={`rounded-full px-1.5 py-0.5 font-mono text-[9px] tabular-nums ${
                        active ? "bg-background/20" : "bg-foreground/8 text-muted-foreground"
                      }`}
                    >
                      {countFor(cat)}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
        ) : null}

        {/* Dish List with Combo & Bundle Badges (§8 of Integration Guide) */}
        <section className="px-4 pt-6">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="min-w-0 truncate text-lg font-black tracking-tight">
              {currentCategory}
            </h2>
            {visible.length > 0 ? (
              <span className="label-mono shrink-0 text-muted-foreground">
                {visible.length} {visible.length === 1 ? "item" : "items"}
              </span>
            ) : null}
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((dish) => {
              // Match active combo deals containing this dish
              const matchingCombo = combos.find(
                (c) =>
                  c.item_ids &&
                  (c.item_ids.includes(dish.id) || c.item_ids.some((id) => dish.id.includes(id))),
              );

              return (
                <li key={dish.id} className="h-full">
                  <button
                    type="button"
                    onClick={() => setSheetDish(dish)}
                    className="group flex h-full w-full items-start gap-4 rounded-3xl bg-card p-3 text-left ring-1 ring-border transition-all cursor-pointer hover:-translate-y-0.5 hover:ring-primary/30 hover:shadow-lg hover:shadow-foreground/5 active:scale-[0.99] active:translate-y-0"
                  >
                    <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-secondary">
                      <img
                        src={dish.image}
                        alt={dish.name}
                        width={1024}
                        height={640}
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      {matchingCombo ? (
                        <span className="absolute top-1.5 left-1.5 rounded-md bg-primary px-1.5 py-0.5 text-[8px] font-black tracking-wider text-primary-foreground uppercase shadow-md">
                          {matchingCombo.kind === "multibuy"
                            ? `${matchingCombo.buy_qty} for ${matchingCombo.pay_qty}`
                            : "Bundle Deal"}
                        </span>
                      ) : null}
                      {/* Decorative — the whole card is the button that opens the dish sheet */}
                      <span
                        aria-hidden
                        className="absolute right-1.5 bottom-1.5 grid size-7 place-items-center rounded-full bg-background text-foreground shadow-md ring-1 ring-border transition-colors group-hover:bg-primary group-hover:text-primary-foreground group-hover:ring-primary"
                      >
                        <Plus className="size-4" strokeWidth={2.6} />
                      </span>
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col gap-1.5 self-stretch py-0.5">
                      {/* Full-width title: a price chip here would squeeze longer
                          dish names into a mid-word ellipsis on narrow screens. */}
                      <span className="line-clamp-2 text-base leading-tight font-bold">
                        {dish.name}
                      </span>

                      {dish.description ? (
                        <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {dish.description}
                        </span>
                      ) : null}

                      <span className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-1.5 pt-2">
                        <span className="font-mono text-[13px] leading-none font-black text-foreground transition-colors group-hover:text-primary">
                          {money(dish.price)}
                        </span>
                        <span className="label-mono flex items-center gap-1 text-muted-foreground">
                          <Clock className="size-3" aria-hidden />
                          {dish.prepMinutes} min
                        </span>
                        <span className="label-mono flex items-center gap-1 text-muted-foreground">
                          <Flame className="size-3" aria-hidden />
                          {dish.calories} kcal
                        </span>
                        {dish.diet ? (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black tracking-wider text-emerald-600 dark:text-emerald-400">
                            {dish.diet.toUpperCase()}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          {visible.length === 0 ? (
            <div className="rounded-3xl bg-secondary/60 px-6 py-10 text-center ring-1 ring-border">
              <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-background text-muted-foreground ring-1 ring-border">
                <UtensilsCrossed className="size-5" aria-hidden />
              </div>
              <p className="mt-3 text-sm font-bold">Nothing in this section yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Check back soon — this kitchen is still adding dishes.
              </p>
            </div>
          ) : null}
        </section>
      </main>

      {sheetDish ? (
        <DishSheet
          dish={sheetDish}
          restaurantSlug={restaurant.slug}
          onClose={() => setSheetDish(null)}
        />
      ) : null}

      <LocationSelectorDialog
        open={openLocationDialog}
        onClose={() => setOpenLocationDialog(false)}
      />

      <CartBar />
    </div>
  );
}
