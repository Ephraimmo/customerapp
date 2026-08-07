/**
 * Shared domain types plus a live registry that Firebase fills at runtime.
 * No restaurant, menu, customer or promotion data is hardcoded here —
 * Firebase Realtime Database is the single source of truth.
 */

export type OptionChoice = { id: string; label: string; delta: number };
export type ExtraChoice = { id: string; label: string; price: number };

export type Dish = {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  popular?: boolean;
  category: string;
  diet?: "veg" | "vegan" | "gf";
  prepMinutes: number;
  calories: number;
  allergens: string[];
  ingredients: string[];
  sizes: OptionChoice[];
  extras: ExtraChoice[];
};

export type Restaurant = {
  slug: string;
  name: string;
  tagline: string;
  cuisines: string[];
  priceBand: "£" | "££" | "£££";
  rating: number;
  reviewCount: number;
  etaMinutes: [number, number];
  deliveryFee: number;
  minOrder: number;
  distanceKm: number;
  image: string;
  badge?: string;
  openNow: boolean;
  hours: string;
  address: string;
  phone: string;
  categories: string[];
  dishes: Dish[];
};

/* ----------------------------- live registry ------------------------------ */

let registry: Restaurant[] = [];

/** Called by the Firebase sync layer whenever restaurant data changes. */
export function registerRestaurants(next: Restaurant[]) {
  registry = next;
}

export function restaurants() {
  return registry;
}

export function getRestaurant(slug: string) {
  return registry.find((r) => r.slug === slug);
}

export function allDishes() {
  return registry.flatMap((r) => r.dishes.map((d) => ({ dish: d, restaurant: r })));
}

export function findDish(dishId: string) {
  return allDishes().find((entry) => entry.dish.id === dishId);
}

export type Coupon = { type: "percent" | "fixed" | "delivery"; value: number };

/** Coupon codes synchronized from Firebase promotions/coupons nodes. */
export const coupons: Record<string, Coupon> = {};

export function registerCoupons(next: Record<string, Coupon>) {
  Object.keys(coupons).forEach((key) => delete coupons[key]);
  Object.assign(coupons, next);
}

export function money(value: number) {
  return `£${value.toFixed(2)}`;
}
