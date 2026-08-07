import { useEffect, useMemo } from "react";
import { toList, useFirebaseValue, type FirebaseRecord, type FirebaseValue } from "./firebase-live";
import { discoverSchemas } from "./firebase-schema";
import {
  registerCoupons,
  registerRestaurants,
  type Coupon,
  type Dish,
  type ExtraChoice,
  type OptionChoice,
  type Restaurant,
} from "./data";

/* -------------------------------------------------------------------------- */
/*  Tolerant readers: Firebase field names vary between portals, so every     */
/*  mapping accepts a list of aliases and never invents data.                 */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is FirebaseRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function pick(record: FirebaseRecord, keys: string[]): unknown {
  for (const key of keys) {
    const match = Object.keys(record).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined && record[match] !== null && record[match] !== undefined)
      return record[match];
  }
  return undefined;
}

function str(record: FirebaseRecord, keys: string[], fallback = ""): string {
  const value = pick(record, keys);
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : fallback;
}

function num(record: FirebaseRecord, keys: string[], fallback = 0): number {
  const value = pick(record, keys);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function bool(record: FirebaseRecord, keys: string[], fallback = true): boolean {
  const value = pick(record, keys);
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (/^(open|active|available|true|yes|online)$/i.test(value.trim())) return true;
    if (/^(closed|inactive|unavailable|false|no|offline)$/i.test(value.trim())) return false;
  }
  if (typeof value === "number") return value !== 0;
  return fallback;
}

function strList(record: FirebaseRecord, keys: string[]): string[] {
  const value = pick(record, keys);
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string") as string[];
  if (isRecord(value)) return Object.values(value).filter((v) => typeof v === "string") as string[];
  if (typeof value === "string")
    return value
      .split(/[,•|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

function slugify(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || fallback;
}

/** Finds the first root node whose key matches one of the given patterns. */
function findNode(root: FirebaseValue, patterns: RegExp[]): FirebaseValue {
  if (!isRecord(root)) return null;
  for (const pattern of patterns) {
    const key = Object.keys(root).find((k) => pattern.test(k));
    if (key) return root[key] as FirebaseValue;
  }
  return null;
}

/* ----------------------------- option mapping ----------------------------- */

function mapOptions(raw: unknown): OptionChoice[] {
  return toList(raw as FirebaseValue).map((item, index) => ({
    id: str(item, ["id", "key", "value"], item.id ?? `size-${index}`),
    label: str(item, ["label", "name", "title", "size"], `Option ${index + 1}`),
    delta: num(item, ["delta", "priceDelta", "extraPrice", "price", "amount"], 0),
  }));
}

function mapExtras(raw: unknown): ExtraChoice[] {
  return toList(raw as FirebaseValue).map((item, index) => ({
    id: str(item, ["id", "key"], item.id ?? `extra-${index}`),
    label: str(item, ["label", "name", "title"], `Extra ${index + 1}`),
    price: num(item, ["price", "amount", "cost", "delta"], 0),
  }));
}

/* ------------------------------ dish mapping ------------------------------ */

export function mapDish(raw: FirebaseRecord & { id: string }, restaurantSlug: string): Dish {
  const name = str(raw, ["name", "title", "itemName", "item_name"], "Menu item");
  const diet = str(raw, ["diet", "dietary", "dietType"]).toLowerCase();
  const price = num(raw, ["price", "basePrice", "amount", "cost", "unitPrice"], 0);
  const discount = num(raw, ["discount_price", "discountPrice", "salePrice"], 0);

  return {
    id: str(raw, ["id", "itemId", "menuItemId"], `${restaurantSlug}-${raw.id}`),
    name,
    description: str(raw, ["description", "desc", "details", "subtitle"]),
    price: discount > 0 && discount < price ? discount : price,
    image: str(raw, ["image", "imageUrl", "image_url", "photo", "photoUrl", "thumbnail", "picture"]),
    ...(bool(raw, ["popular", "isPopular", "featured", "is_featured", "isFeatured"], false)
      ? { popular: true }
      : {}),
    category: str(raw, ["category", "categoryName", "categoryId", "group", "section"], "Menu"),
    ...(diet === "veg" || diet === "vegan" || diet === "gf" ? { diet: diet as "veg" | "vegan" | "gf" } : {}),
    prepMinutes: num(raw, ["prepMinutes", "prep_time_minutes", "preparationTime", "prepTime", "cookTime"], 0),
    calories: num(raw, ["calories", "kcal", "energy"], 0),
    allergens: strList(raw, ["allergens", "allergies"]),
    ingredients: strList(raw, ["ingredients", "components"]),
    sizes: mapOptions(pick(raw, ["sizes", "variants", "options", "sizeOptions"])),
    extras: mapExtras(pick(raw, ["extras", "addons", "addOns", "add_ons", "toppings"])),
  };
}

/* --------------------------- shared menu node ----------------------------- */

/**
 * The operations console writes menus to `/menus/{restaurantId}` split across
 * four siblings: categories, items, variants, addons. This assembles them into
 * dishes without inventing any data.
 */
function menuFromMenusNode(menuNode: FirebaseValue, slug: string) {
  if (!isRecord(menuNode)) return { dishes: [] as Dish[], categories: [] as string[] };

  const categories = toList(menuNode["categories"] as FirebaseValue)
    .filter((cat) => bool(cat, ["is_available", "isAvailable", "available"], true))
    .sort((a, b) => num(a, ["sort_order", "sortOrder"], 0) - num(b, ["sort_order", "sortOrder"], 0));

  const categoryName = new Map<string, string>();
  categories.forEach((cat) => {
    categoryName.set(
      str(cat, ["id"], cat.id),
      str(cat, ["name", "title", "label"], "Menu"),
    );
  });

  const variants = toList(menuNode["variants"] as FirebaseValue);
  const addons = toList(menuNode["addons"] as FirebaseValue);
  const itemKey = (record: FirebaseRecord) =>
    str(record, ["menu_item_id", "menuItemId", "item_id", "itemId"]);

  const dishes = toList(menuNode["items"] as FirebaseValue)
    .filter((item) => bool(item, ["is_available", "isAvailable", "available"], true))
    .map((item) => {
      const id = str(item, ["id"], item.id);
      const catId = str(item, ["category_id", "categoryId"]);
      const dish = mapDish(item as FirebaseRecord & { id: string }, slug);

      return {
        ...dish,
        category:
          categoryName.get(catId) ??
          str(item, ["category", "categoryName"], categories.length ? "Menu" : "Menu"),
        sizes: variants
          .filter((v) => itemKey(v) === id)
          .filter((v) => bool(v, ["is_available", "isAvailable"], true))
          .sort((a, b) => num(a, ["sort_order", "sortOrder"], 0) - num(b, ["sort_order", "sortOrder"], 0))
          .map((v, index) => ({
            id: str(v, ["id"], `variant-${index}`),
            label: str(v, ["name", "label"], `Option ${index + 1}`),
            delta: num(v, ["price_delta", "priceDelta", "delta"], 0),
          })),
        extras: addons
          .filter((a) => itemKey(a) === id)
          .filter((a) => bool(a, ["is_available", "isAvailable"], true))
          .map((a, index) => ({
            id: str(a, ["id"], `addon-${index}`),
            label: str(a, ["name", "label"], `Extra ${index + 1}`),
            price: num(a, ["price", "amount"], 0),
          })),
      };
    });

  // Only surface categories that actually have visible items, in admin order.
  const used = new Set(dishes.map((d) => d.category));
  const ordered = Array.from(categoryName.values()).filter((name) => used.has(name));
  const extra = Array.from(used).filter((name) => !ordered.includes(name));

  return { dishes, categories: [...ordered, ...extra] };
}

/* --------------------------- restaurant mapping --------------------------- */

function collectDishes(
  raw: FirebaseRecord & { id: string },
  slug: string,
  standaloneItems: Array<FirebaseRecord & { id: string }>,
): Dish[] {
  const inline = toList(
    pick(raw, ["menu", "menuItems", "menu_items", "dishes", "items", "products"]) as FirebaseValue,
  );

  // Nested menu → categories → items shapes.
  const nested = inline.flatMap((entry) => {
    const children = pick(entry, ["items", "dishes", "menuItems", "products"]);
    if (!children) return [];
    const categoryName = str(entry, ["name", "title", "category"], "Menu");
    return toList(children as FirebaseValue).map((item) => ({
      ...item,
      category: str(item, ["category"], categoryName),
    }));
  });

  const own = standaloneItems.filter((item) => {
    const restRef = str(item, [
      "restaurantId",
      "restaurant_id",
      "restaurantSlug",
      "restaurant",
      "branchId",
      "storeId",
    ]);
    return restRef && (restRef === raw.id || slugify(restRef, "") === slug);
  });

  const flat = nested.length ? nested : inline.filter((item) => !pick(item, ["items", "dishes"]));
  const merged = [...flat, ...own];

  const seen = new Set<string>();
  return merged
    .map((item) => mapDish(item as FirebaseRecord & { id: string }, slug))
    .filter((dish) => {
      if (seen.has(dish.id)) return false;
      seen.add(dish.id);
      return true;
    });
}

export function mapRestaurant(
  raw: FirebaseRecord & { id: string },
  standaloneItems: Array<FirebaseRecord & { id: string }> = [],
  menuNode: FirebaseValue = null,
): Restaurant {
  const name = str(raw, ["name", "restaurantName", "title", "storeName"], "Restaurant");
  const slug = slugify(str(raw, ["slug", "handle"], "") || name, raw.id);
  const shared = menuFromMenusNode(menuNode, slug);
  const dishes = shared.dishes.length ? shared.dishes : collectDishes(raw, slug, standaloneItems);
  const etaMin = num(raw, ["etaMin", "minDeliveryTime", "deliveryTimeMin", "prepTime", "prep_time_minutes"], 0);
  const etaMaxRaw = num(raw, ["etaMax", "maxDeliveryTime", "deliveryTimeMax", "deliveryTime"], 0);
  const priceBandRaw = str(raw, ["priceBand", "priceRange", "priceLevel"], "££");
  const categoriesFromDishes = shared.categories.length
    ? shared.categories
    : Array.from(new Set(dishes.map((d) => d.category)));
  const explicitCategories = shared.categories.length
    ? shared.categories
    : strList(raw, ["categories", "menuCategories", "sections"]);
  const opens = str(raw, ["opens_at", "opensAt"]);
  const closes = str(raw, ["closes_at", "closesAt"]);

  return {
    slug,
    name,
    tagline: str(raw, ["tagline", "description", "about", "summary", "bio"]),
    cuisines: strList(raw, ["cuisines", "cuisine", "tags", "categoriesLabels"]),
    priceBand: (["£", "££", "£££"].includes(priceBandRaw) ? priceBandRaw : "££") as Restaurant["priceBand"],
    rating: num(raw, ["rating", "averageRating", "stars", "score"], 0),
    reviewCount: num(raw, ["reviewCount", "rating_count", "reviews", "totalReviews", "ratingCount"], 0),
    etaMinutes: [etaMin || Math.max(0, etaMaxRaw - 10), etaMaxRaw || etaMin + 15],
    deliveryFee: num(raw, ["deliveryFee", "delivery_fee", "deliveryCharge", "shippingFee"], 0),
    minOrder: num(raw, ["minOrder", "minimumOrder", "min_order", "minOrderValue"], 0),
    distanceKm: num(raw, ["distanceKm", "distance", "distance_km", "delivery_radius_km"], 0),
    image: str(raw, [
      "coverImage",
      "cover",
      "image",
      "imageUrl",
      "image_url",
      "banner",
      "photo",
      "logo",
      "logoUrl",
    ]),
    ...(str(raw, ["badge", "label", "promoLabel"]) ? { badge: str(raw, ["badge", "label", "promoLabel"]) } : {}),
    openNow: bool(raw, ["openNow", "isOpen", "open"], true),
    hours: str(raw, ["hours", "openingHours", "opening_hours", "workingHours"]) ||
      (opens && closes ? `${opens}–${closes}` : ""),
    address: str(raw, ["address", "location", "streetAddress", "fullAddress"]),
    phone: str(raw, ["phone", "phoneNumber", "contact", "mobile"]),
    categories: (explicitCategories.length ? explicitCategories : categoriesFromDishes).filter(Boolean),
    dishes,
  };
}


/* --------------------------------- hooks --------------------------------- */

const RESTAURANT_NODES = [/^restaurants?$/i, /^stores?$/i, /^branch(es)?$/i, /restaurant/i];
const MENU_ITEM_NODES = [/^menu_?items?$/i, /^menuitems$/i, /^dishes$/i, /^products$/i, /^items$/i];
const PROMO_NODES = [/^promotions?$/i, /^promos?$/i, /^deals?$/i, /^offers?$/i, /^coupons?$/i];
const CATEGORY_NODES = [/^categories$/i, /^cuisines$/i, /^menu_?categories$/i];

/** Single shared subscription to the whole database — the source of truth. */
export function useFirebaseRoot() {
  const root = useFirebaseValue<FirebaseValue>("/");
  const schemas = useMemo(() => discoverSchemas(root.data), [root.data]);
  return { ...root, schemas, nodes: schemas.map((s) => s.path) };
}

export function useRestaurants() {
  const root = useFirebaseRoot();

  const restaurants = useMemo(() => {
    const standalone = toList(findNode(root.data, MENU_ITEM_NODES));
    const menus = findNode(root.data, [/^menus$/i, /^menu$/i]);
    return toList(findNode(root.data, RESTAURANT_NODES)).map((raw) => {
      const rid = str(raw, ["id"], raw.id);
      const menuNode = isRecord(menus) ? ((menus[rid] ?? menus[raw.id]) as FirebaseValue) : null;
      return mapRestaurant(raw, standalone, menuNode ?? null);
    });
  }, [root.data]);


  return { ...root, restaurants };
}

export function useRestaurant(slug: string) {
  const { restaurants, ...rest } = useRestaurants();
  const restaurant = useMemo(
    () => restaurants.find((r) => r.slug === slug) ?? null,
    [restaurants, slug],
  );
  return { ...rest, restaurant };
}

export type Promotion = {
  id: string;
  title: string;
  detail: string;
  code: string;
  type: Coupon["type"];
  value: number;
};

function couponType(raw: FirebaseRecord): Coupon["type"] {
  const kind = str(raw, ["type", "discountType", "kind"]).toLowerCase();
  if (/deliver/.test(kind)) return "delivery";
  if (/percent|pct|%/.test(kind)) return "percent";
  if (/fixed|amount|flat/.test(kind)) return "fixed";
  return num(raw, ["percent", "percentage", "discountPercent"], 0) > 0 ? "percent" : "fixed";
}

export function usePromotions() {
  const root = useFirebaseRoot();
  const promotions = useMemo<Promotion[]>(
    () =>
      toList(findNode(root.data, PROMO_NODES)).map((raw) => ({
        id: raw.id,
        title: str(raw, ["title", "name", "headline"], "Offer"),
        detail: str(raw, ["detail", "description", "terms", "subtitle"]),
        code: str(raw, ["code", "couponCode", "promoCode"]),
        type: couponType(raw),
        value: num(raw, ["value", "amount", "discount", "percent", "percentage", "discountValue"], 0),
      })),
    [root.data],
  );
  return { ...root, promotions };
}

export type LiveCategory = { id: string; label: string; short: string };

export function useCategories() {
  const { restaurants, data, ...rest } = useRestaurants();

  const categories = useMemo<LiveCategory[]>(() => {
    const explicit = toList(findNode(data, CATEGORY_NODES)).map((raw) => {
      const label = str(raw, ["label", "name", "title"], "Category");
      return { id: raw.id, label, short: label.slice(0, 6) };
    });
    if (explicit.length) return explicit;

    const derived = new Set<string>();
    restaurants.forEach((r) => r.cuisines.forEach((c) => derived.add(c)));
    return Array.from(derived).map((label) => ({
      id: slugify(label, label),
      label,
      short: label.slice(0, 6),
    }));
  }, [data, restaurants]);

  return { ...rest, data, categories };
}

/**
 * Keeps the shared registry (used by cart/checkout/account) in sync with
 * Firebase. Mounted once at the app root.
 */
export function useLiveSync() {
  const { restaurants, ...rest } = useRestaurants();
  const { promotions } = usePromotions();

  useEffect(() => {
    registerRestaurants(restaurants);
  }, [restaurants]);

  useEffect(() => {
    const map: Record<string, Coupon> = {};
    promotions.forEach((promo) => {
      if (promo.code) map[promo.code.toUpperCase()] = { type: promo.type, value: promo.value };
    });
    registerCoupons(map);
  }, [promotions]);

  return { ...rest, restaurants, promotions };
}
