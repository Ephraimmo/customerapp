import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Search as SearchIcon, SlidersHorizontal } from "lucide-react";
import { z } from "zod";
import { BottomNav } from "@/components/app/bottom-nav";
import { CartBar } from "@/components/app/cart-bar";
import { RestaurantCard } from "@/components/app/restaurant-card";
import { money } from "@/lib/data";
import { useRestaurants } from "@/lib/firebase-adapters";

const searchSchema = z.object({ q: z.string().optional() });

export const Route = createFileRoute("/search")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Search restaurants & dishes — Hearth" },
      {
        name: "description",
        content:
          "Search by restaurant, dish, cuisine or diet. Filter by rating, delivery fee and prep time.",
      },
      { property: "og:title", content: "Search restaurants & dishes — Hearth" },
      {
        property: "og:description",
        content: "Find exactly what you're craving with cuisine, price and rating filters.",
      },
    ],
  }),
  component: SearchPage,
});

type SortKey = "recommended" | "rating" | "eta" | "fee" | "distance";

const sorts: { id: SortKey; label: string }[] = [
  { id: "recommended", label: "Recommended" },
  { id: "rating", label: "Top rated" },
  { id: "eta", label: "Fastest" },
  { id: "fee", label: "Lowest fee" },
  { id: "distance", label: "Nearest" },
];

function SearchPage() {
  const { q } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [term, setTerm] = useState(q ?? "");
  const [sort, setSort] = useState<SortKey>("recommended");
  const [freeDeliveryOnly, setFreeDeliveryOnly] = useState(false);
  const { restaurants } = useRestaurants();

  const needle = term.trim().toLowerCase();

  const matchedRestaurants = restaurants
    .filter((r) =>
      needle
        ? r.name.toLowerCase().includes(needle) ||
          r.cuisines.some((c) => c.toLowerCase().includes(needle)) ||
          r.tagline.toLowerCase().includes(needle) ||
          r.dishes.some((d) => d.name.toLowerCase().includes(needle))
        : true,
    )
    .filter((r) => (freeDeliveryOnly ? r.deliveryFee === 0 : true))
    .sort((a, b) => {
      if (sort === "rating") return b.rating - a.rating;
      if (sort === "eta") return a.etaMinutes[1] - b.etaMinutes[1];
      if (sort === "fee") return a.deliveryFee - b.deliveryFee;
      if (sort === "distance") return a.distanceKm - b.distanceKm;
      return b.rating * 10 - a.distanceKm - (b.rating * 10 - b.distanceKm) || 0;
    });

  const matchedDishes = needle
    ? restaurants
        .flatMap((r) => r.dishes.map((dish) => ({ dish, restaurant: r })))
        .filter(({ dish }) => dish.name.toLowerCase().includes(needle))
        .slice(0, 6)
    : [];

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-background md:max-w-3xl lg:max-w-6xl">
      <header className="sticky top-0 z-40 md:static border-b border-border bg-background/90 px-4 pt-5 pb-3 backdrop-blur-md">
        <h1 className="mb-4 text-2xl leading-none font-black tracking-tight">Search</h1>
        <div className="relative">
          <SearchIcon
            className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            autoFocus
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              void navigate({ search: { q: e.target.value || undefined } });
            }}
            aria-label="Search restaurants and dishes"
            placeholder="Search cravings, dishes, vibes…"
            className="h-12 w-full rounded-2xl bg-secondary pr-4 pl-11 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
          <button
            type="button"
            onClick={() => setFreeDeliveryOnly((v) => !v)}
            aria-pressed={freeDeliveryOnly}
            className={`flex flex-shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-[11px] font-black tracking-widest uppercase ring-1 ${
              freeDeliveryOnly
                ? "bg-primary/10 text-primary ring-primary/30"
                : "bg-secondary ring-border"
            }`}
          >
            <SlidersHorizontal className="size-3" aria-hidden />
            Free delivery
          </button>
          {sorts.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSort(s.id)}
              aria-pressed={sort === s.id}
              className={`flex-shrink-0 rounded-full px-4 py-2 text-[11px] font-black tracking-widest uppercase ring-1 ${
                sort === s.id ? "bg-foreground text-background ring-transparent" : "bg-secondary ring-border"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </header>

      <main className="space-y-8 px-4 pt-6 pb-44 md:pb-24">
        {matchedDishes.length ? (
          <section>
            <h2 className="label-mono mb-3 text-muted-foreground">Dishes</h2>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {matchedDishes.map(({ dish, restaurant }) => (
                <Link
                  key={dish.id}
                  to="/restaurant/$slug"
                  params={{ slug: restaurant.slug }}
                  className="flex items-center gap-3 rounded-2xl bg-secondary p-3 ring-1 ring-border"
                >
                  <img
                    src={dish.image}
                    alt={dish.name}
                    width={1024}
                    height={640}
                    loading="lazy"
                    className="size-14 rounded-xl object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{dish.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {restaurant.name}
                    </span>
                  </span>
                  <span className="font-mono text-sm font-bold">{money(dish.price)}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-8 md:grid md:grid-cols-2 md:gap-8 md:space-y-0 lg:grid-cols-3">
          <h2 className="label-mono text-muted-foreground md:col-span-full">
            {matchedRestaurants.length} restaurant{matchedRestaurants.length === 1 ? "" : "s"}
          </h2>
          {matchedRestaurants.length === 0 ? (
            <div className="rounded-3xl bg-secondary p-8 text-center ring-1 ring-border md:col-span-full">
              <p className="text-lg font-black">Nothing matched</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a different dish, cuisine or clear your filters.
              </p>
            </div>

          ) : (
            matchedRestaurants.map((r, i) => (
              <RestaurantCard key={r.slug} restaurant={r} delayMs={i * 80} />
            ))
          )}
        </section>
      </main>

      <CartBar />
      <BottomNav />
    </div>
  );
}
