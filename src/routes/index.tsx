import { createFileRoute, Link } from "@tanstack/react-router";
import { MapPin, Search } from "lucide-react";
import { BottomNav } from "@/components/app/bottom-nav";
import { CartBar } from "@/components/app/cart-bar";
import { RestaurantCard } from "@/components/app/restaurant-card";
import { money } from "@/lib/data";
import { useCategories, usePromotions, useRestaurants } from "@/lib/firebase-adapters";
import { useCart } from "@/lib/cart";

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

function Discover() {
  const { orders } = useCart();
  const { restaurants, loading, error } = useRestaurants();
  const { categories } = useCategories();
  const { promotions } = usePromotions();
  const recent = orders[0];

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-background md:max-w-3xl lg:max-w-6xl">
      <header className="sticky top-0 z-40 md:static border-b border-border bg-background/90 px-4 pt-4 pb-3 backdrop-blur-md">
        <div className="mb-4 flex items-center justify-between md:hidden">
          <Link to="/account" className="flex flex-col">
            <span className="label-mono text-muted-foreground">Deliver to</span>
            <span className="flex items-center gap-1 text-sm font-bold">
              <MapPin className="size-3.5 text-primary" aria-hidden />
              242 High Street, St. Ives
            </span>
          </Link>
          <Link
            to="/account"
            aria-label="Your account"
            className="grid size-10 place-items-center rounded-full bg-secondary text-sm font-black outline-1 outline-border"
          >
            AM
          </Link>
        </div>
        <Link
          to="/search"
          className="relative flex h-12 items-center rounded-2xl bg-secondary pl-11 text-sm text-muted-foreground"
        >
          <Search className="absolute left-4 size-4" aria-hidden />
          Search cravings, dishes, vibes…
        </Link>
      </header>

      <main className="pb-44 md:pb-24">
        <h1 className="sr-only">Discover food near you</h1>

        <section aria-label="Categories" className="no-scrollbar flex gap-6 overflow-x-auto px-4 py-6 md:flex-wrap md:justify-start md:overflow-visible">
          {categories.map((cat, i) => (
            <Link
              key={cat.id}
              to="/search"
              search={{ q: cat.label }}
              className="flex flex-shrink-0 flex-col items-center gap-2"
            >
              <span
                className={`grid size-16 place-items-center rounded-3xl text-xs font-bold uppercase ring-1 ${
                  i === 0
                    ? "bg-primary/10 text-primary ring-primary/20"
                    : "bg-secondary text-foreground ring-border"
                }`}
              >
                {cat.short}
              </span>
              <span className="text-[11px] font-semibold tracking-tighter uppercase opacity-60">
                {cat.label}
              </span>
            </Link>
          ))}
        </section>

        <section aria-label="Todays deals" className="no-scrollbar mb-8 flex gap-3 overflow-x-auto px-4 md:grid md:grid-cols-3 md:overflow-visible">
          {promotions.map((deal) => (
            <div
              key={deal.id}
              className="w-64 flex-shrink-0 rounded-3xl md:w-auto bg-secondary p-5 ring-1 ring-border"
            >
              <span className="label-mono text-primary">Today's deal</span>
              <p className="mt-2 text-base leading-tight font-black">{deal.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{deal.detail}</p>
              <p className="label-mono mt-4 text-muted-foreground">Code {deal.code}</p>
            </div>
          ))}
        </section>

        {recent ? (
          <section className="mb-8 px-4">
            <div className="rounded-3xl bg-foreground p-5 text-background">
              <span className="label-mono opacity-60">Recently ordered</span>
              <p className="mt-2 text-lg leading-tight font-bold">{recent.restaurantName}</p>
              <p className="mt-1 text-xs opacity-60">
                {recent.lines.length} item{recent.lines.length === 1 ? "" : "s"} •{" "}
                {money(recent.total)}
              </p>
              <Link
                to="/orders/$orderId"
                params={{ orderId: recent.id }}
                className="mt-4 inline-block text-[11px] font-black tracking-widest text-primary uppercase"
              >
                Track order →
              </Link>
            </div>
          </section>
        ) : null}

        <section className="grid gap-8 px-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-end justify-between md:col-span-full">
            <h2 className="text-2xl leading-none font-black tracking-tight">
              Recommended
              <br />
              For You
            </h2>
            <Link to="/search" className="font-mono text-xs font-bold text-primary">
              See all
            </Link>
          </div>

          {restaurants.length === 0 ? (
            <div className="rounded-3xl bg-secondary p-8 text-center ring-1 ring-border md:col-span-full">
              <p className="text-lg font-black">
                {loading ? "Loading kitchens…" : "No restaurants available yet"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {error
                  ? "We couldn't reach the live menu service. Showing what we have cached."
                  : "New restaurants appear here the moment they go live."}
              </p>
            </div>
          ) : (
            restaurants.map((restaurant, i) => (
              <RestaurantCard
                key={restaurant.slug}
                restaurant={restaurant}
                delayMs={i * 100}
                priority={i === 0}
              />
            ))
          )}
        </section>
      </main>

      <CartBar />
      <BottomNav />
    </div>
  );
}
