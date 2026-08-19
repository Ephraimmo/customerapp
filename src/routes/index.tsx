import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Bike,
  Check,
  ChevronDown,
  Clock,
  Compass,
  DollarSign,
  Gift,
  Leaf,
  MapPin,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tag,
  Utensils,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { BottomNav } from "@/components/app/bottom-nav";
import { CartBar } from "@/components/app/cart-bar";
import { RestaurantCard } from "@/components/app/restaurant-card";
import { money } from "@/lib/data";
import {
  useCategories,
  useLoyaltyWallet,
  usePointsConfig,
  useRestaurants,
} from "@/lib/firebase-adapters";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useLocation } from "@/lib/location";
import { LocationSelectorDialog } from "@/components/app/location-selector-dialog";
import { haversineDistanceKm } from "@/lib/geo";
import { getClosestBranch } from "@/lib/branch-selector";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hearth — Food delivery from local kitchens" },
      {
        name: "description",
        content:
          "Order from nearby restaurants, customize every dish and track your delivery live with Hearth.",
      },
      { property: "og:title", content: "Hearth — Food delivery from local kitchens" },
      {
        property: "og:description",
        content: "Discover nearby kitchens, build your order in a few taps and track it live.",
      },
    ],
  }),
  component: Discover,
});

export type SortOption = "distance" | "rating" | "fastest" | "fee";
export type PriceOption = "all" | "R" | "RR" | "RRR";

interface FilterState {
  sortBy: SortOption;
  priceBand: PriceOption;
  maxEtaMinutes: number | null;
  maxDeliveryFee: number | null;
  onlyWithDeals: boolean;
  onlyTopRated: boolean;
}

const DEFAULT_FILTERS: FilterState = {
  sortBy: "distance",
  priceBand: "all",
  maxEtaMinutes: null,
  maxDeliveryFee: null,
  onlyWithDeals: false,
  onlyTopRated: false,
};

function Discover() {
  const { orders } = useCart();
  const { user } = useAuth();
  const { restaurants, loading, error } = useRestaurants();
  const { categories } = useCategories();
  const pointsConfig = usePointsConfig();
  const wallet = useLoyaltyWallet(user?.uid || "guest_customer");
  const { activeLocation, gpsCoordinates } = useLocation();

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [openLocationModal, setOpenLocationModal] = useState(false);

  const recent = orders[0];

  const customerCoords = useMemo(() => {
    if (activeLocation && activeLocation.latitude != null && activeLocation.longitude != null) {
      return { latitude: activeLocation.latitude, longitude: activeLocation.longitude };
    }
    if (gpsCoordinates && gpsCoordinates.latitude != null && gpsCoordinates.longitude != null) {
      return { latitude: gpsCoordinates.latitude, longitude: gpsCoordinates.longitude };
    }
    return { latitude: -26.1952, longitude: 28.0345 };
  }, [activeLocation, gpsCoordinates]);

  // Active filter count for badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.sortBy !== "distance") count++;
    if (filters.priceBand !== "all") count++;
    if (filters.maxEtaMinutes !== null) count++;
    if (filters.maxDeliveryFee !== null) count++;
    if (filters.onlyWithDeals) count++;
    if (filters.onlyTopRated) count++;
    if (selectedCategory !== null) count++;
    return count;
  }, [filters, selectedCategory]);

  // Sort & filter restaurants by proximity and selected filters
  const filteredRestaurants = useMemo(() => {
    let list = [...restaurants];

    // Filter by selected cuisine category
    if (selectedCategory) {
      const catLower = selectedCategory.toLowerCase();
      list = list.filter(
        (r) =>
          (r.cuisines || []).some((c) => c?.toLowerCase().includes(catLower)) ||
          (r.categories || []).some((c) => c?.toLowerCase().includes(catLower)) ||
          (r.dishes || []).some((d) => d?.category?.toLowerCase().includes(catLower)),
      );
    }

    // Filter by Price Band
    if (filters.priceBand !== "all") {
      list = list.filter((r) => r.priceBand === filters.priceBand);
    }

    // Filter by Max ETA (based on closest branch)
    if (filters.maxEtaMinutes !== null) {
      list = list.filter((r) => {
        const info = getClosestBranch(r, customerCoords, "delivery");
        const prep = r.prep_time_minutes ?? r.etaMinutes[0] ?? 20;
        const totalEta = prep + Math.ceil((info.distanceKm || 0) / 0.5);
        return totalEta <= filters.maxEtaMinutes!;
      });
    }

    // Filter by Max Delivery Fee (based on closest branch)
    if (filters.maxDeliveryFee !== null) {
      list = list.filter((r) => {
        const fee = getClosestBranch(r, customerCoords, "delivery").deliveryFee;
        return fee <= filters.maxDeliveryFee!;
      });
    }

    // Filter by Top Rated
    if (filters.onlyTopRated) {
      list = list.filter((r) => r.rating >= 4.8);
    }

    // Filter by Deals & Combos
    if (filters.onlyWithDeals) {
      list = list.filter((r) => Boolean(r.badge) || Boolean(r.delivery_tiers?.[0]?.fee === 0));
    }

    // Sort list by selected criteria or proximity to closest branch (§14 & §15 of Contract)
    return list.sort((a, b) => {
      if (filters.sortBy === "rating") {
        return b.rating - a.rating;
      }
      if (filters.sortBy === "fastest") {
        const infoA = getClosestBranch(a, customerCoords, "delivery");
        const infoB = getClosestBranch(b, customerCoords, "delivery");
        const prepA = a.prep_time_minutes ?? a.etaMinutes[0] ?? 20;
        const prepB = b.prep_time_minutes ?? b.etaMinutes[0] ?? 20;
        const etaA = prepA + Math.ceil((infoA.distanceKm || 0) / 0.5);
        const etaB = prepB + Math.ceil((infoB.distanceKm || 0) / 0.5);
        return etaA - etaB;
      }
      if (filters.sortBy === "fee") {
        const feeA = getClosestBranch(a, customerCoords, "delivery").deliveryFee;
        const feeB = getClosestBranch(b, customerCoords, "delivery").deliveryFee;
        return feeA - feeB;
      }
      // Default: Proximity / distance to closest branch
      const distA = getClosestBranch(a, customerCoords, "delivery").distanceKm;
      const distB = getClosestBranch(b, customerCoords, "delivery").distanceKm;
      return distA - distB;
    });
  }, [restaurants, customerCoords, selectedCategory, filters]);

  function handleResetFilters() {
    setFilters(DEFAULT_FILTERS);
    setSelectedCategory(null);
    toast.info("All filters have been reset");
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-background md:max-w-3xl lg:max-w-6xl">
      {/* Top Header & Search Area */}
      <header className="sticky top-0 z-40 md:static border-b border-border bg-background/95 px-4 pt-4 pb-3 backdrop-blur-md">
        <div className="mb-3 flex items-center justify-between md:hidden">
          <button
            type="button"
            onClick={() => setOpenLocationModal(true)}
            className="flex flex-col text-left cursor-pointer group"
          >
            <span className="label-mono text-muted-foreground flex items-center gap-1 text-[11px]">
              Deliver to{" "}
              <ChevronDown className="size-3 text-muted-foreground group-hover:text-primary transition-colors" />
            </span>
            <span className="flex items-center gap-1.5 text-sm font-bold text-foreground group-hover:text-primary transition-colors">
              <MapPin className="size-3.5 text-primary shrink-0" aria-hidden />
              <span className="truncate max-w-[200px]">
                {activeLocation
                  ? `${activeLocation.label} • ${activeLocation.street}`
                  : "Set Delivery Location"}
              </span>
            </span>
          </button>

          <Link
            to="/account"
            aria-label="Your account"
            className="flex items-center gap-2 rounded-full bg-secondary py-1 pl-3 pr-1 text-xs font-black ring-1 ring-border"
          >
            <span className="font-mono text-primary">{wallet.balance} pts</span>
            <span className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-black">
              {user ? user.initials : "GU"}
            </span>
          </Link>
        </div>

        {/* Global Search Bar + Interactive Filter Toggle Button */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Link
              to="/search"
              className="relative flex h-12 flex-1 items-center rounded-2xl bg-secondary pl-11 pr-4 text-sm text-muted-foreground ring-1 ring-border/80 hover:bg-secondary/80 transition-colors"
            >
              <Search className="absolute left-4 size-4 text-muted-foreground" aria-hidden />
              <span className="truncate">Search dishes, cuisines, restaurants…</span>
            </Link>

            {/* Interactive Filter Dropdown Toggle Button */}
            <button
              type="button"
              onClick={() => setShowFilterDropdown((v) => !v)}
              aria-expanded={showFilterDropdown}
              aria-label="Toggle filters and cuisines"
              className={`flex h-12 items-center gap-2 rounded-2xl px-4 text-xs font-bold ring-1 transition-all cursor-pointer ${
                showFilterDropdown || activeFilterCount > 0
                  ? "bg-primary text-primary-foreground ring-primary shadow-md shadow-primary/20"
                  : "bg-secondary text-foreground ring-border hover:bg-secondary/80"
              }`}
            >
              <SlidersHorizontal className="size-4" />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 ? (
                <span
                  className={`grid size-5 place-items-center rounded-full text-[10px] font-black ${
                    showFilterDropdown
                      ? "bg-primary-foreground text-primary"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  {activeFilterCount}
                </span>
              ) : (
                <ChevronDown
                  className={`size-3.5 transition-transform duration-300 ${
                    showFilterDropdown ? "rotate-180" : ""
                  }`}
                />
              )}
            </button>
          </div>

          {/* Interactive Dropdown Filter Panel (with Explore Cuisines directly inside) */}
          {showFilterDropdown && (
            <div className="rounded-3xl bg-card p-5 border border-border shadow-2xl space-y-5 animate-[var(--animate-sheet-up)] max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-border/80 pb-3 sticky top-0 bg-card/95 backdrop-blur-sm z-10 -mt-1 pt-1">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="size-4 text-primary" />
                  <span className="text-sm font-black text-foreground">
                    Filter by Cuisine & Preferences
                  </span>
                  {activeFilterCount > 0 ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-black text-primary border border-primary/20">
                      {activeFilterCount} active
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  {activeFilterCount > 0 ? (
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="size-3" />
                      Reset
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setShowFilterDropdown(false)}
                    aria-label="Close filters"
                    className="grid size-7 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </div>

              {/* 1. Explore Cuisines / Categories */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="label-mono text-[11px] text-muted-foreground block font-bold">
                    Explore Cuisines & Food Types
                  </span>
                  {selectedCategory ? (
                    <button
                      type="button"
                      onClick={() => setSelectedCategory(null)}
                      className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                    >
                      Clear cuisine
                    </button>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(null)}
                    className={`h-9 px-3.5 rounded-xl text-xs font-bold transition-all border cursor-pointer inline-flex items-center gap-1.5 ${
                      selectedCategory === null
                        ? "bg-foreground text-background border-foreground shadow-sm"
                        : "bg-secondary/60 text-foreground border-border hover:bg-secondary"
                    }`}
                  >
                    🔥 All Food
                  </button>

                  {categories.map((cat) => {
                    const isSelected = selectedCategory === cat.label;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(isSelected ? null : cat.label)}
                        className={`h-9 px-3.5 rounded-xl text-xs font-bold transition-all border cursor-pointer inline-flex items-center gap-1.5 ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-secondary/60 text-foreground border-border hover:bg-secondary"
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Sort By */}
              <div className="space-y-2 border-t border-border/60 pt-3">
                <div className="flex items-center justify-between">
                  <span className="label-mono text-[11px] text-muted-foreground block font-bold">
                    Sort Kitchens By
                  </span>
                  {filters.sortBy !== "distance" ? (
                    <button
                      type="button"
                      onClick={() => setFilters((f) => ({ ...f, sortBy: "distance" }))}
                      className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                    >
                      Reset sort
                    </button>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: "distance", label: "📍 Closest First" },
                    { id: "rating", label: "⭐ Highest Rated (4.8+)" },
                    { id: "fastest", label: "⚡ Fastest Arrival (≤20 min)" },
                    { id: "fee", label: "🛵 Lowest Delivery Fee" },
                  ].map((opt) => {
                    const isSelected = filters.sortBy === opt.id;
                    const isDefault = opt.id === "distance";
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setFilters((f) => ({ ...f, sortBy: opt.id as SortOption }))}
                        className={`h-9 px-3.5 rounded-xl text-xs font-bold transition-all border cursor-pointer inline-flex items-center gap-1.5 ${
                          isSelected
                            ? isDefault
                              ? "bg-foreground text-background border-foreground shadow-sm"
                              : "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-secondary/60 text-foreground border-border hover:bg-secondary"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Price Range */}
              <div className="space-y-2 border-t border-border/60 pt-3">
                <div className="flex items-center justify-between">
                  <span className="label-mono text-[11px] text-muted-foreground block font-bold">
                    Price Range
                  </span>
                  {filters.priceBand !== "all" ? (
                    <button
                      type="button"
                      onClick={() => setFilters((f) => ({ ...f, priceBand: "all" }))}
                      className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                    >
                      Clear price
                    </button>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: "all", label: "🏷️ All Prices" },
                    { id: "R", label: "R • Budget (Under R100)" },
                    { id: "RR", label: "RR • Mid-Range (R100–R250)" },
                    { id: "RRR", label: "RRR • Gourmet (R250+)" },
                  ].map((p) => {
                    const isSelected = filters.priceBand === p.id;
                    const isDefault = p.id === "all";
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          setFilters((f) => ({ ...f, priceBand: p.id as PriceOption }))
                        }
                        className={`h-9 px-3.5 rounded-xl text-xs font-bold transition-all border cursor-pointer inline-flex items-center gap-1.5 ${
                          isSelected
                            ? isDefault
                              ? "bg-foreground text-background border-foreground shadow-sm"
                              : "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-secondary/60 text-foreground border-border hover:bg-secondary"
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. Max Delivery Time */}
              <div className="space-y-2 border-t border-border/60 pt-3">
                <div className="flex items-center justify-between">
                  <span className="label-mono text-[11px] text-muted-foreground block font-bold">
                    Max Delivery Time
                  </span>
                  {filters.maxEtaMinutes !== null ? (
                    <button
                      type="button"
                      onClick={() => setFilters((f) => ({ ...f, maxEtaMinutes: null }))}
                      className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                    >
                      Clear time
                    </button>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    { val: null, label: "⏱️ Any Time" },
                    { val: 20, label: "⚡ ≤ 20 min" },
                    { val: 25, label: "⚡ ≤ 25 min" },
                    { val: 35, label: "⏱️ ≤ 35 min" },
                    { val: 45, label: "🕒 ≤ 45 min" },
                  ].map((t) => {
                    const isSelected = filters.maxEtaMinutes === t.val;
                    const isDefault = t.val === null;
                    return (
                      <button
                        key={String(t.val)}
                        type="button"
                        onClick={() => setFilters((f) => ({ ...f, maxEtaMinutes: t.val }))}
                        className={`h-9 px-3.5 rounded-xl text-xs font-bold transition-all border cursor-pointer inline-flex items-center gap-1.5 ${
                          isSelected
                            ? isDefault
                              ? "bg-foreground text-background border-foreground shadow-sm"
                              : "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-secondary/60 text-foreground border-border hover:bg-secondary"
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 6. Delivery Fee Cap */}
              <div className="space-y-2 border-t border-border/60 pt-3">
                <div className="flex items-center justify-between">
                  <span className="label-mono text-[11px] text-muted-foreground block font-bold">
                    Delivery Fee Cap
                  </span>
                  {filters.maxDeliveryFee !== null ? (
                    <button
                      type="button"
                      onClick={() => setFilters((prev) => ({ ...prev, maxDeliveryFee: null }))}
                      className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                    >
                      Clear fee
                    </button>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    { val: null, label: "🛵 Any Fee" },
                    { val: 0, label: "🎉 Free Delivery (R 0)" },
                    { val: 15, label: "🏷️ ≤ R 15" },
                    { val: 25, label: "💰 ≤ R 25" },
                    { val: 35, label: "🪙 ≤ R 35" },
                  ].map((f) => {
                    const isSelected = filters.maxDeliveryFee === f.val;
                    const isDefault = f.val === null;
                    return (
                      <button
                        key={String(f.val)}
                        type="button"
                        onClick={() => setFilters((prev) => ({ ...prev, maxDeliveryFee: f.val }))}
                        className={`h-9 px-3.5 rounded-xl text-xs font-bold transition-all border cursor-pointer inline-flex items-center gap-1.5 ${
                          isSelected
                            ? isDefault
                              ? "bg-foreground text-background border-foreground shadow-sm"
                              : "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-secondary/60 text-foreground border-border hover:bg-secondary"
                        }`}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 7. Special Offers & Deals */}
              <div className="space-y-2 border-t border-border/60 pt-3">
                <div className="flex items-center justify-between">
                  <span className="label-mono text-[11px] text-muted-foreground block font-bold">
                    Special Offers & Deals
                  </span>
                  {filters.onlyTopRated || filters.onlyWithDeals ? (
                    <button
                      type="button"
                      onClick={() =>
                        setFilters((f) => ({ ...f, onlyTopRated: false, onlyWithDeals: false }))
                      }
                      className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                    >
                      Clear offers
                    </button>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFilters((f) => ({ ...f, onlyTopRated: !f.onlyTopRated }))}
                    className={`h-9 px-3.5 rounded-xl text-xs font-bold transition-all border cursor-pointer inline-flex items-center gap-1.5 ${
                      filters.onlyTopRated
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-secondary/60 text-foreground border-border hover:bg-secondary"
                    }`}
                  >
                    <Star className="size-3.5 fill-current" />
                    <span>4.8+ Stars Rating Only</span>
                    {filters.onlyTopRated ? <Check className="size-3.5 ml-1" /> : null}
                  </button>

                  <button
                    type="button"
                    onClick={() => setFilters((f) => ({ ...f, onlyWithDeals: !f.onlyWithDeals }))}
                    className={`h-9 px-3.5 rounded-xl text-xs font-bold transition-all border cursor-pointer inline-flex items-center gap-1.5 ${
                      filters.onlyWithDeals
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-secondary/60 text-foreground border-border hover:bg-secondary"
                    }`}
                  >
                    <Sparkles className="size-3.5" />
                    <span>Has Active Deals & Combos</span>
                    {filters.onlyWithDeals ? <Check className="size-3.5 ml-1" /> : null}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between border-t border-border/80 pt-3 sticky bottom-0 bg-card/95 backdrop-blur-sm z-10 -mb-1 pb-1">
                <span className="text-xs font-mono font-bold text-muted-foreground">
                  {filteredRestaurants.length}{" "}
                  {filteredRestaurants.length === 1 ? "kitchen" : "kitchens"} matching
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="rounded-xl px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    Clear All
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFilterDropdown(false)}
                    className="rounded-xl bg-primary px-5 py-2 text-xs font-black uppercase tracking-wider text-primary-foreground shadow-md hover:bg-primary/90 transition-all cursor-pointer"
                  >
                    Show {filteredRestaurants.length} Results
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="space-y-6 px-4 pt-4 pb-44 md:pb-24">
        <h1 className="sr-only">Discover food near you</h1>

        {/* Live Loyalty Points Banner (Responsive) */}
        <section className="rounded-3xl bg-primary/10 p-4 sm:p-5 border border-primary/25 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20 shrink-0">
                <Gift className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-black text-foreground">Hearth Rewards Programme</h2>
                  <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary">
                    {pointsConfig.discount_percent || 10}% OFF
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  Earn points on every delivery • Redeem {pointsConfig.points_required || 100} pts
                  for discounts
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-3 border-t border-primary/15 pt-2.5 sm:border-t-0 sm:pt-0 shrink-0">
              <div className="text-left sm:text-right">
                <span className="font-mono text-base font-black text-primary block leading-none">
                  {wallet.balance} pts
                </span>
                <span className="text-[10px] text-muted-foreground">Available</span>
              </div>
              <Link
                to="/account"
                className="inline-flex h-9 items-center justify-center rounded-xl bg-primary px-4 text-xs font-black tracking-wider uppercase text-primary-foreground shadow-md hover:bg-primary/90 transition-all cursor-pointer whitespace-nowrap"
              >
                Wallet
              </Link>
            </div>
          </div>
        </section>

        {/* Recently Ordered Callout (Responsive) */}
        {recent ? (
          <section className="rounded-3xl bg-secondary/80 p-3.5 sm:p-4 border border-border/80 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="grid size-10 place-items-center rounded-xl bg-foreground text-background shrink-0">
                  <Clock className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="label-mono text-[9px] text-muted-foreground uppercase tracking-widest">
                      Order Again
                    </span>
                    <span className="text-muted-foreground/40">•</span>
                    <span className="text-[10px] font-mono font-bold text-foreground">
                      {money(recent.total)}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-foreground truncate">
                    {recent.restaurant_name}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    #{recent.order_number || recent.id}
                  </p>
                </div>
              </div>

              <Link
                to="/orders/$orderId"
                params={{ orderId: recent.id }}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-background px-3.5 text-xs font-bold text-primary border border-border hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>Track Order</span>
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </section>
        ) : null}

        {/* Active Filter Chips (if any filter is selected) */}
        {activeFilterCount > 0 ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs font-bold text-muted-foreground">Active:</span>

            {selectedCategory ? (
              <span className="inline-flex items-center gap-1 rounded-xl bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary border border-primary/20">
                Cuisine: {selectedCategory}
                <button
                  type="button"
                  onClick={() => setSelectedCategory(null)}
                  className="hover:text-foreground cursor-pointer"
                >
                  <X className="size-3" />
                </button>
              </span>
            ) : null}

            {filters.sortBy !== "distance" ? (
              <span className="inline-flex items-center gap-1 rounded-xl bg-secondary px-2.5 py-1 text-xs font-bold border border-border">
                Sort: {filters.sortBy}
                <button
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, sortBy: "distance" }))}
                  className="hover:text-foreground cursor-pointer"
                >
                  <X className="size-3" />
                </button>
              </span>
            ) : null}

            {filters.priceBand !== "all" ? (
              <span className="inline-flex items-center gap-1 rounded-xl bg-secondary px-2.5 py-1 text-xs font-bold border border-border">
                Price: {filters.priceBand}
                <button
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, priceBand: "all" }))}
                  className="hover:text-foreground cursor-pointer"
                >
                  <X className="size-3" />
                </button>
              </span>
            ) : null}

            {filters.maxEtaMinutes !== null ? (
              <span className="inline-flex items-center gap-1 rounded-xl bg-secondary px-2.5 py-1 text-xs font-bold border border-border">
                ≤ {filters.maxEtaMinutes} min
                <button
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, maxEtaMinutes: null }))}
                  aria-label="Remove max ETA filter"
                  className="hover:text-foreground cursor-pointer"
                >
                  <X className="size-3" />
                </button>
              </span>
            ) : null}

            {filters.maxDeliveryFee !== null ? (
              <span className="inline-flex items-center gap-1 rounded-xl bg-secondary px-2.5 py-1 text-xs font-bold border border-border">
                {filters.maxDeliveryFee === 0
                  ? "Free Delivery"
                  : `≤ R ${filters.maxDeliveryFee} fee`}
                <button
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, maxDeliveryFee: null }))}
                  aria-label="Remove delivery fee filter"
                  className="hover:text-foreground cursor-pointer"
                >
                  <X className="size-3" />
                </button>
              </span>
            ) : null}

            {filters.onlyTopRated ? (
              <span className="inline-flex items-center gap-1 rounded-xl bg-secondary px-2.5 py-1 text-xs font-bold border border-border">
                ⭐ 4.8+ Stars
                <button
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, onlyTopRated: false }))}
                  aria-label="Remove top rated filter"
                  className="hover:text-foreground cursor-pointer"
                >
                  <X className="size-3" />
                </button>
              </span>
            ) : null}

            {filters.onlyWithDeals ? (
              <span className="inline-flex items-center gap-1 rounded-xl bg-secondary px-2.5 py-1 text-xs font-bold border border-border">
                ✨ Deals & Combos
                <button
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, onlyWithDeals: false }))}
                  aria-label="Remove deals filter"
                  className="hover:text-foreground cursor-pointer"
                >
                  <X className="size-3" />
                </button>
              </span>
            ) : null}

            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs font-bold text-destructive hover:underline cursor-pointer ml-1"
            >
              Reset all
            </button>
          </div>
        ) : null}

        {/* Kitchens List Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl md:text-2xl font-black tracking-tight text-foreground">
                Kitchens Near You
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sorted by proximity from {activeLocation ? activeLocation.label : "your location"}
              </p>
            </div>

            <span className="text-xs font-mono font-bold text-muted-foreground">
              {filteredRestaurants.length}{" "}
              {filteredRestaurants.length === 1 ? "kitchen" : "kitchens"}
            </span>
          </div>

          {/* Restaurant Grid */}
          {filteredRestaurants.length === 0 ? (
            <div className="rounded-3xl bg-secondary p-12 text-center border border-border space-y-3">
              <p className="text-lg font-black text-foreground">
                {loading ? "Loading kitchens…" : "No kitchens matched your filters"}
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {activeFilterCount > 0
                  ? "Try resetting some of your filter criteria or choosing a different cuisine."
                  : error
                    ? "We couldn't connect to the live catalog. Please refresh to retry."
                    : "No restaurants currently available in this area."}
              </p>
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-xs font-black uppercase text-primary-foreground tracking-wider cursor-pointer shadow-md hover:bg-primary/90"
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredRestaurants.map((restaurant, i) => (
                <RestaurantCard
                  key={restaurant.slug}
                  restaurant={restaurant}
                  delayMs={i * 60}
                  priority={i === 0}
                />
              ))}
            </div>
          )}
        </section>

        {/* Why Hearth / Value Props Strip */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-border pt-8 text-xs">
          <div className="rounded-2xl bg-secondary/60 p-4 border border-border/80 space-y-1">
            <div className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
              <Clock className="size-4" />
            </div>
            <p className="font-bold text-foreground">Fast Delivery</p>
            <p className="text-[11px] text-muted-foreground">Cooked to order in ~20 min</p>
          </div>

          <div className="rounded-2xl bg-secondary/60 p-4 border border-border/80 space-y-1">
            <div className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
              <Compass className="size-4" />
            </div>
            <p className="font-bold text-foreground">Live GPS Stream</p>
            <p className="text-[11px] text-muted-foreground">Real-time driver location</p>
          </div>

          <div className="rounded-2xl bg-secondary/60 p-4 border border-border/80 space-y-1">
            <div className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
              <Gift className="size-4" />
            </div>
            <p className="font-bold text-foreground">Earn Loyalty Points</p>
            <p className="text-[11px] text-muted-foreground">Points on every delivery</p>
          </div>

          <div className="rounded-2xl bg-secondary/60 p-4 border border-border/80 space-y-1">
            <div className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
              <Tag className="size-4" />
            </div>
            <p className="font-bold text-foreground">Combo Deals</p>
            <p className="text-[11px] text-muted-foreground">Automatic 3-for-2 & bundles</p>
          </div>
        </section>
      </main>

      <LocationSelectorDialog
        open={openLocationModal}
        onClose={() => setOpenLocationModal(false)}
      />
      <CartBar />
      <BottomNav />
    </div>
  );
}
