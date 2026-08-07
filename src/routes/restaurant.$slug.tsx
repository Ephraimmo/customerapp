import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Bike, Clock, Heart, Star } from "lucide-react";
import { CartBar } from "@/components/app/cart-bar";
import { DishSheet } from "@/components/app/dish-sheet";
import { money, type Dish } from "@/lib/data";
import { useRestaurant } from "@/lib/firebase-adapters";

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
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sheetDish, setSheetDish] = useState<Dish | null>(null);
  const [favorite, setFavorite] = useState(false);

  if (!restaurant) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-md px-4 py-24 text-center md:max-w-3xl">
        <p className="text-2xl font-black tracking-tight">
          {loading ? "Loading menu…" : "Restaurant unavailable"}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {loading ? "Fetching the live menu." : "This kitchen isn't published right now."}
        </p>
        <Link to="/" className="mt-6 inline-block font-mono text-xs font-bold text-primary">
          Back to discover
        </Link>
      </div>
    );
  }

  const currentCategory =
    activeCategory && restaurant.categories.includes(activeCategory)
      ? activeCategory
      : (restaurant.categories[0] ?? "Menu");

  const visible =
    currentCategory === "Popular"
      ? restaurant.dishes.filter((d) => d.popular)
      : restaurant.dishes.filter((d) => d.category === currentCategory);

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-background md:max-w-3xl lg:max-w-6xl">
      <div className="relative">
        <img
          src={restaurant.image}
          alt={`${restaurant.name} kitchen`}
          width={1024}
          height={640}
          className="aspect-[16/10] w-full object-cover md:aspect-[21/9] md:max-h-[380px] md:rounded-b-[32px]"
        />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
          <Link
            to="/"
            aria-label="Back to discover"
            className="grid size-11 place-items-center rounded-full bg-background/90 ring-1 ring-border backdrop-blur"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={() => setFavorite((v) => !v)}
            aria-label={favorite ? "Remove from favorites" : "Save to favorites"}
            aria-pressed={favorite}
            className="grid size-11 place-items-center rounded-full bg-background/90 ring-1 ring-border backdrop-blur"
          >
            <Heart
              className={`size-4 ${favorite ? "fill-primary text-primary" : ""}`}
              aria-hidden
            />
          </button>
        </div>
      </div>

      <main className="pb-44 md:pb-24">
        <header className="px-4 pt-5">
          <h1 className="text-2xl leading-tight font-black tracking-tight">{restaurant.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {restaurant.tagline} • {restaurant.priceBand}
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-secondary p-3 ring-1 ring-border">
              <span className="flex items-center gap-1 text-sm font-black">
                <Star className="size-3.5 fill-primary text-primary" aria-hidden />
                {restaurant.rating}
              </span>
              <span className="label-mono text-muted-foreground">
                {restaurant.reviewCount} reviews
              </span>
            </div>
            <div className="rounded-2xl bg-secondary p-3 ring-1 ring-border">
              <span className="flex items-center gap-1 text-sm font-black">
                <Clock className="size-3.5" aria-hidden />
                {restaurant.etaMinutes[0]}–{restaurant.etaMinutes[1]}
              </span>
              <span className="label-mono text-muted-foreground">minutes</span>
            </div>
            <div className="rounded-2xl bg-secondary p-3 ring-1 ring-border">
              <span className="flex items-center gap-1 text-sm font-black">
                <Bike className="size-3.5" aria-hidden />
                {restaurant.deliveryFee === 0 ? "Free" : money(restaurant.deliveryFee)}
              </span>
              <span className="label-mono text-muted-foreground">
                min {money(restaurant.minOrder)}
              </span>
            </div>
          </div>

          <p className="label-mono mt-4 text-muted-foreground">
            {restaurant.openNow ? "Open now" : "Closed"} • {restaurant.hours} •{" "}
            {restaurant.distanceKm} km • {restaurant.address}
          </p>
        </header>

        <nav
          aria-label="Menu categories"
          className="no-scrollbar sticky top-0 z-30 md:top-16 mt-6 flex gap-2 overflow-x-auto border-b border-border bg-background/95 px-4 py-3 backdrop-blur-md"
        >
          {restaurant.categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              aria-pressed={currentCategory === cat}
              className={`flex-shrink-0 rounded-full px-4 py-2 text-[11px] font-black tracking-widest uppercase ring-1 ${
                currentCategory === cat
                  ? "bg-foreground text-background ring-transparent"
                  : "bg-secondary ring-border"
              }`}
            >
              {cat}
            </button>
          ))}
        </nav>

        <section className="px-4 pt-6">
          <h2 className="mb-4 text-lg font-black tracking-tight">{currentCategory}</h2>
          <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {visible.map((dish) => (
              <li key={dish.id}>
                <button
                  type="button"
                  onClick={() => setSheetDish(dish)}
                  className="flex w-full items-center gap-4 rounded-3xl bg-card p-3 text-left ring-1 ring-border transition-transform active:scale-[0.99]"
                >
                  <img
                    src={dish.image}
                    alt={dish.name}
                    width={1024}
                    height={640}
                    loading="lazy"
                    className="size-20 shrink-0 rounded-2xl object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base leading-tight font-bold">{dish.name}</span>
                    <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
                      {dish.description}
                    </span>
                    <span className="label-mono mt-2 block text-muted-foreground">
                      {dish.prepMinutes} min • {dish.calories} kcal
                      {dish.diet ? ` • ${dish.diet.toUpperCase()}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-sm font-bold">{money(dish.price)}</span>
                </button>
              </li>
            ))}
          </ul>
          {visible.length === 0 ? (
            <p className="rounded-3xl bg-secondary p-6 text-center text-sm text-muted-foreground ring-1 ring-border">
              Nothing in this section yet.
            </p>
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
      <CartBar />
    </div>
  );
}
