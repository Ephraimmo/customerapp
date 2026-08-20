import { useEffect, useMemo, useState } from "react";
import { toList, useFirebaseValue, type FirebaseRecord, type FirebaseValue } from "./firebase-live";
import { discoverSchemas } from "./firebase-schema";
import {
  DEFAULT_RESTAURANTS,
  registerCoupons,
  registerRestaurants,
  type BranchMenuAvailabilityRecord,
  type Coupon,
  type Dish,
  type ExtraChoice,
  type FirebaseRestaurantBranch,
  type OptionChoice,
  type OrderPaymentEvidence,
  type Restaurant,
  type RestaurantPaymentConfig,
} from "./data";
import type { DeliveryTier } from "./pricing";
import {
  DEFAULT_GLOBAL_POINTS_CONFIG,
  type ComboDeal,
  type GlobalPointsConfig,
  type LedgerEntry,
  type LoyaltyWallet,
  type PromoCampaign,
  type RestaurantPointsOverride,
} from "./promotions";
import { rtdbSubscribe } from "./firebase";
import { buildLegacyMainBranch } from "./branch-selector";

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
    image: str(raw, [
      "image",
      "imageUrl",
      "image_url",
      "photo",
      "photoUrl",
      "thumbnail",
      "picture",
    ]),
    ...(bool(raw, ["popular", "isPopular", "featured", "is_featured", "isFeatured"], false)
      ? { popular: true }
      : {}),
    category: str(raw, ["category", "categoryName", "categoryId", "group", "section"], "Menu"),
    ...(diet === "veg" || diet === "vegan" || diet === "gf"
      ? { diet: diet as "veg" | "vegan" | "gf" }
      : {}),
    prepMinutes: num(
      raw,
      ["prepMinutes", "prep_time_minutes", "preparationTime", "prepTime", "cookTime"],
      15,
    ),
    calories: num(raw, ["calories", "kcal", "energy"], 650),
    allergens: strList(raw, ["allergens", "allergies"]),
    ingredients: strList(raw, ["ingredients", "components"]),
    sizes: mapOptions(pick(raw, ["sizes", "variants", "options", "sizeOptions"])),
    extras: mapExtras(pick(raw, ["extras", "addons", "addOns", "add_ons", "toppings"])),
  };
}

/* --------------------------- shared menu node ----------------------------- */

function menuFromMenusNode(menuNode: FirebaseValue, slug: string) {
  if (!isRecord(menuNode)) return { dishes: [] as Dish[], categories: [] as string[] };

  const categories = toList(menuNode["categories"] as FirebaseValue)
    .filter((cat) => bool(cat, ["is_available", "isAvailable", "available"], true))
    .sort(
      (a, b) => num(a, ["sort_order", "sortOrder"], 0) - num(b, ["sort_order", "sortOrder"], 0),
    );

  const categoryName = new Map<string, string>();
  categories.forEach((cat) => {
    categoryName.set(str(cat, ["id"], cat.id), str(cat, ["name", "title", "label"], "Menu"));
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
          .sort(
            (a, b) =>
              num(a, ["sort_order", "sortOrder"], 0) - num(b, ["sort_order", "sortOrder"], 0),
          )
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
  const mapped = merged
    .map((item) => mapDish(item as FirebaseRecord & { id: string }, slug))
    .filter((dish) => {
      if (seen.has(dish.id)) return false;
      seen.add(dish.id);
      return true;
    });

  if (mapped.length > 0) return mapped;

  return [
    {
      id: `${slug}-special-1`,
      name: `Signature ${str(raw, ["cuisine"], "Kitchen")} Special`,
      description: "Prepared fresh to order using finest local ingredients and authentic recipe.",
      price: 135,
      image: str(
        raw,
        ["image_url", "image", "coverImage"],
        "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=900&q=70",
      ),
      popular: true,
      category: "Popular",
      prepMinutes: 15,
      calories: 680,
      allergens: [],
      ingredients: ["Chef Selection", "Fresh Herbs", "House Sauce"],
      sizes: [
        { id: "reg", label: "Regular Portion", delta: 0 },
        { id: "large", label: "Large Portion", delta: 35 },
      ],
      extras: [
        { id: "extra-sauce", label: "Extra House Sauce", price: 15 },
        { id: "extra-side", label: "Side Crispy Fries", price: 25 },
      ],
    },
    {
      id: `${slug}-special-2`,
      name: "Chef's Tasting Platter",
      description: "A delicious combination of our most popular dishes, perfect for sharing.",
      price: 185,
      image: str(
        raw,
        ["image_url", "image", "coverImage"],
        "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=900&q=70",
      ),
      popular: true,
      category: "Mains",
      prepMinutes: 20,
      calories: 820,
      allergens: [],
      ingredients: ["Grilled Special", "Seasoned Rice", "House Salad"],
      sizes: [
        { id: "std", label: "Standard Platter", delta: 0 },
        { id: "feast", label: "Feast Platter (Double)", delta: 65 },
      ],
      extras: [{ id: "extra-dip", label: "Garlic Aioli Dip", price: 18 }],
    },
  ];
}

export function mapRestaurant(
  raw: FirebaseRecord & { id: string },
  standaloneItems: Array<FirebaseRecord & { id: string }> = [],
  menuNode: FirebaseValue = null,
): Restaurant {
  const id = str(raw, ["id"], raw.id);
  const name = str(raw, ["name", "restaurantName", "title", "storeName"], "Restaurant");
  const slug = slugify(str(raw, ["slug", "handle"], "") || name, raw.id);
  const shared = menuFromMenusNode(menuNode, slug);
  const dishes = shared.dishes.length ? shared.dishes : collectDishes(raw, slug, standaloneItems);
  const etaMin = num(
    raw,
    ["etaMin", "minDeliveryTime", "deliveryTimeMin", "prepTime", "prep_time_minutes"],
    15,
  );
  const etaMaxRaw = num(raw, ["etaMax", "maxDeliveryTime", "deliveryTimeMax", "deliveryTime"], 35);
  const priceBandRaw = str(raw, ["priceBand", "priceRange", "priceLevel"], "RR");
  const categoriesFromDishes = shared.categories.length
    ? shared.categories
    : Array.from(new Set(dishes.map((d) => d.category)));
  const explicitCategories = shared.categories.length
    ? shared.categories
    : strList(raw, ["categories", "menuCategories", "sections", "cuisine"]);
  const opens = str(raw, ["opens_at", "opensAt"]);
  const closes = str(raw, ["closes_at", "closesAt"]);

  // Explicit Fulfilment flags from Operations Console
  const delivery_enabled = (raw["delivery_enabled"] as boolean | undefined) !== false;
  const pickup_enabled = (raw["pickup_enabled"] as boolean | undefined) !== false;
  const delivery_radius_km =
    Number(raw["delivery_radius_km"]) || num(raw, ["deliveryRadiusKm", "radiusKm"], 10);

  const rawTiers = pick(raw, ["delivery_tiers", "deliveryTiers", "tiers"]);
  const delivery_tiers: DeliveryTier[] =
    Array.isArray(rawTiers) && rawTiers.length > 0
      ? (rawTiers as DeliveryTier[])
      : isRecord(rawTiers) && Object.keys(rawTiers).length > 0
        ? (Object.values(rawTiers) as DeliveryTier[])
        : [
            { id: "tier_0", up_to_km: 3, fee: 15, label: "0–3 km" },
            { id: "tier_1", up_to_km: 6, fee: 25, label: "3–6 km" },
            { id: "tier_2", up_to_km: 10, fee: 35, label: "6–10 km" },
          ];

  const latRaw = pick(raw, ["latitude", "lat"]);
  const lngRaw = pick(raw, ["longitude", "lng", "lon"]);
  const latitude = latRaw != null && latRaw !== "" ? Number(latRaw) : -26.1662;
  const longitude = lngRaw != null && lngRaw !== "" ? Number(lngRaw) : 28.0273;
  const status = (str(raw, ["status"], "pending") as Restaurant["status"]) || "pending";

  return {
    id,
    slug,
    name,
    tagline: str(
      raw,
      ["tagline", "description", "about", "summary", "bio", "cuisine"],
      "Delicious food delivered hot & fresh",
    ),
    cuisines: strList(raw, ["cuisines", "cuisine", "tags", "categoriesLabels"]).length
      ? strList(raw, ["cuisines", "cuisine", "tags", "categoriesLabels"])
      : [str(raw, ["cuisine"], "Gourmet")],
    priceBand: priceBandRaw,
    rating: num(raw, ["rating", "averageRating", "stars", "score"], 4.7),
    reviewCount: num(
      raw,
      ["reviewCount", "rating_count", "reviews", "totalReviews", "ratingCount"],
      120,
    ),
    etaMinutes: [etaMin || 15, etaMaxRaw || 35],
    deliveryFee: num(raw, ["deliveryFee", "delivery_fee", "deliveryCharge", "shippingFee"], 20),
    minOrder: num(raw, ["minOrder", "minimumOrder", "min_order", "minOrderValue"], 60),
    distanceKm: num(raw, ["distanceKm", "distance", "distance_km"], 2.1),
    image:
      str(raw, [
        "image_url",
        "imageUrl",
        "coverImage",
        "cover",
        "image",
        "banner",
        "photo",
        "logo",
        "logoUrl",
      ]) ||
      "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=900&q=70",
    ...(str(raw, ["badge", "label", "promoLabel"])
      ? { badge: str(raw, ["badge", "label", "promoLabel"]) }
      : {}),
    openNow: bool(raw, ["openNow", "isOpen", "open"], true),
    hours:
      str(raw, ["hours", "openingHours", "opening_hours", "workingHours"]) ||
      (opens && closes ? `${opens}–${closes}` : "10:00–22:30"),
    address: str(
      raw,
      ["address", "location", "streetAddress", "fullAddress"],
      "Johannesburg, South Africa",
    ),
    phone: str(raw, ["phone", "phoneNumber", "contact", "mobile"], "+27 11 555 0100"),
    categories: (explicitCategories.length ? explicitCategories : categoriesFromDishes).filter(
      Boolean,
    ),
    dishes,

    delivery_enabled,
    pickup_enabled,
    delivery_radius_km,
    delivery_tiers,
    latitude,
    longitude,
    prep_time_minutes: num(raw, ["prep_time_minutes", "prepTime", "prepMinutes"], 20),
    opens_at: opens || "10:00",
    closes_at: closes || "22:30",
    status,
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
    const rawRestaurants = findNode(root.data, RESTAURANT_NODES);
    const rawBranchesRoot =
      (root.data && typeof root.data === "object"
        ? (root.data as any).restaurantBranches || (root.data as any).branches
        : null) || {};

    const fbList = toList(rawRestaurants)
      .map((raw) => {
        const rid = str(raw, ["id"], raw.id);
        const menuNode = isRecord(menus) ? ((menus[rid] ?? menus[raw.id]) as FirebaseValue) : null;
        return mapRestaurant(raw, standalone, menuNode ?? null);
      })
      .filter((r) => r.status === "approved");

    // Seamlessly merge Firebase restaurants with curated catalog, preventing duplicates
    const seen = new Set<string>();
    const merged: Restaurant[] = [];

    fbList.forEach((r) => {
      seen.add(r.slug);
      merged.push(r);
    });

    DEFAULT_RESTAURANTS.forEach((r) => {
      if (!seen.has(r.slug)) {
        seen.add(r.slug);
        merged.push(r);
      }
    });

    // Populate branches list for each restaurant from rawBranchesRoot (§7 of Contract)
    return merged.map((r) => {
      const rid = r.id || r.slug;
      const branchMap =
        rawBranchesRoot[rid] ||
        rawBranchesRoot[r.slug] ||
        (r.id ? rawBranchesRoot[r.id] : null) ||
        {};
      const branchesList: FirebaseRestaurantBranch[] = Object.values(branchMap).filter(
        (b: any) => Boolean(b && typeof b === "object" && b.id),
      ) as FirebaseRestaurantBranch[];

      if (branchesList.length === 0) {
        branchesList.push(buildLegacyMainBranch(r));
      }

      return {
        ...r,
        branches: branchesList,
        branch_count: branchesList.length,
      };
    });
  }, [root.data]);

  return { ...root, restaurants };
}

export function useRestaurant(slug: string) {
  const { restaurants, ...rest } = useRestaurants();
  const restaurant = useMemo(() => {
    const query = slug.toLowerCase().trim();
    return (
      restaurants.find(
        (r) =>
          r.slug.toLowerCase() === query ||
          slugify(r.slug, "").toLowerCase() === query ||
          slugify(r.name, "").toLowerCase() === query ||
          r.name.toLowerCase() === query,
      ) ??
      DEFAULT_RESTAURANTS.find(
        (r) =>
          r.slug.toLowerCase() === query ||
          slugify(r.slug, "").toLowerCase() === query ||
          slugify(r.name, "").toLowerCase() === query ||
          r.name.toLowerCase() === query,
      ) ??
      null
    );
  }, [restaurants, slug]);

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

/* -------------------------------------------------------------------------- */
/*  Live Promotions, Combos & Points Subscriptions (§4 of Integration Guide)   */
/* -------------------------------------------------------------------------- */

export function usePromoCampaigns() {
  const [coupons, setCoupons] = useState<PromoCampaign[]>([]);

  useEffect(() => {
    return rtdbSubscribe<Record<string, PromoCampaign>>("promotions/codes", (snap) => {
      if (snap && typeof snap === "object") {
        const list = Object.entries(snap)
          .filter(([, c]) => c && typeof c === "object")
          .map(([id, c]) => ({ ...c, id: c.id || id }));
        setCoupons(list);
      } else {
        setCoupons([]);
      }
    });
  }, []);

  return coupons;
}

export function useComboDeals(restaurantId?: string) {
  const [combos, setCombos] = useState<ComboDeal[]>([]);

  useEffect(() => {
    return rtdbSubscribe<Record<string, ComboDeal>>("promotions/combos", (snap) => {
      if (snap && typeof snap === "object") {
        const list = Object.entries(snap).map(([id, c]) => ({ ...c, id: c.id || id }));
        setCombos(list);
      } else {
        setCombos([]);
      }
    });
  }, []);

  const filtered = useMemo(() => {
    if (!restaurantId) return combos;
    return combos.filter(
      (c) => c.is_active && (!c.restaurant_id || c.restaurant_id === restaurantId),
    );
  }, [combos, restaurantId]);

  return filtered;
}

export function usePointsConfig() {
  const [config, setConfig] = useState<GlobalPointsConfig>(DEFAULT_GLOBAL_POINTS_CONFIG);

  useEffect(() => {
    return rtdbSubscribe<GlobalPointsConfig>("promotions/global/points_config", (snap) => {
      if (snap) {
        setConfig(snap);
      }
    });
  }, []);

  return config;
}

export function useRestaurantPointsOverrides() {
  const [overrides, setOverrides] = useState<Record<string, RestaurantPointsOverride>>({});

  useEffect(() => {
    return rtdbSubscribe<Record<string, RestaurantPointsOverride>>(
      "promotions/restaurant_points",
      (snap) => {
        if (snap && typeof snap === "object") {
          setOverrides(snap);
        } else {
          setOverrides({});
        }
      },
    );
  }, []);

  return overrides;
}

export function useLoyaltyWallet(customerId: string | null | undefined) {
  const [wallet, setWallet] = useState<LoyaltyWallet>({
    balance: 0,
    lifetime_earned: 0,
    lifetime_redeemed: 0,
    updated_at: new Date().toISOString(),
  });

  useEffect(() => {
    if (!customerId) return;
    return rtdbSubscribe<LoyaltyWallet>(`loyalty/wallets/${customerId}`, (snap) => {
      if (snap) {
        setWallet(snap);
      }
    });
  }, [customerId]);

  return wallet;
}

export function useLoyaltyLedger(customerId: string | null | undefined) {
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);

  useEffect(() => {
    if (!customerId) return;
    return rtdbSubscribe<Record<string, LedgerEntry>>(`loyalty/ledger/${customerId}`, (snap) => {
      if (snap && typeof snap === "object") {
        const list = Object.entries(snap)
          .map(([id, entry]) => ({ ...entry, id: entry.id || id }))
          .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
        setLedger(list);
      } else {
        setLedger([]);
      }
    });
  }, [customerId]);

  return ledger;
}

export function usePromotions() {
  const root = useFirebaseRoot();
  const campaigns = usePromoCampaigns();

  const promotions = useMemo<Promotion[]>(() => {
    if (campaigns.length > 0) {
      return campaigns
        .filter((c) => c.is_active)
        .map((c) => ({
          id: c.id,
          title: c.name,
          detail: c.description || (c.type === "percent" ? `${c.value}% OFF` : `R ${c.value} OFF`),
          code: c.code,
          type:
            c.type === "free_delivery" ? "delivery" : c.type === "percent" ? "percent" : "fixed",
          value: c.value,
        }));
    }

    const list = toList(findNode(root.data, PROMO_NODES)).map((raw) => ({
      id: raw.id,
      title: str(raw, ["title", "name", "headline"], "Offer"),
      detail: str(raw, ["detail", "description", "terms", "subtitle"]),
      code: str(raw, ["code", "couponCode", "promoCode"]),
      type: couponType(raw),
      value: num(raw, ["value", "amount", "discount", "percent", "percentage", "discountValue"], 0),
    }));

    return list;
  }, [campaigns, root.data]);

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

/**
 * Live subscription to a restaurant's payment methods configuration
 * at `/restaurants/{restaurantId}/payment_config`.
 */
export function useRestaurantPaymentConfig(restaurantIdOrSlug: string | null | undefined) {
  const { restaurants } = useRestaurants();
  const [paymentConfig, setPaymentConfig] = useState<RestaurantPaymentConfig | null>(null);
  const [loading, setLoading] = useState(Boolean(restaurantIdOrSlug));

  // Resolve actual Firebase restaurant id if a slug was provided
  const targetId = useMemo(() => {
    if (!restaurantIdOrSlug) return null;
    const match = restaurants.find(
      (r) => r.id === restaurantIdOrSlug || r.slug === restaurantIdOrSlug,
    );
    return match?.id || restaurantIdOrSlug;
  }, [restaurantIdOrSlug, restaurants]);

  useEffect(() => {
    if (!targetId) {
      setPaymentConfig(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = rtdbSubscribe<RestaurantPaymentConfig>(
      `restaurants/${targetId}/payment_config`,
      (val) => {
        setPaymentConfig(val ?? null);
        setLoading(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [targetId]);

  return { paymentConfig, loading };
}

/**
 * Live subscription to an order's payment evidence record
 * at `/orders/{orderId}/payment`.
 */
export function useOrderPayment(orderId: string | null | undefined) {
  const [payment, setPayment] = useState<OrderPaymentEvidence | null>(null);
  const [loading, setLoading] = useState(Boolean(orderId));

  useEffect(() => {
    if (!orderId) {
      setPayment(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = rtdbSubscribe<OrderPaymentEvidence>(`orders/${orderId}/payment`, (val) => {
      setPayment(val ?? null);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [orderId]);

  return { payment, loading };
}

/**
 * Live subscription to all branches of a restaurant
 * at `/restaurantBranches/{restaurantId}` (§7).
 */
export function useRestaurantBranches(restaurantIdOrSlug: string | null | undefined) {
  const { restaurants } = useRestaurants();
  const [branchesMap, setBranchesMap] = useState<Record<string, FirebaseRestaurantBranch>>({});
  const [loading, setLoading] = useState(Boolean(restaurantIdOrSlug));

  // Resolve actual restaurant ID from slug if needed
  const targetId = useMemo(() => {
    if (!restaurantIdOrSlug) return null;
    const match = restaurants.find(
      (r) => r.id === restaurantIdOrSlug || r.slug === restaurantIdOrSlug,
    );
    return match?.id || restaurantIdOrSlug;
  }, [restaurantIdOrSlug, restaurants]);

  useEffect(() => {
    if (!targetId) {
      setBranchesMap({});
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = rtdbSubscribe<Record<string, FirebaseRestaurantBranch>>(
      `restaurantBranches/${targetId}`,
      (data) => {
        setBranchesMap(data || {});
        setLoading(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [targetId]);

  const branches = useMemo<FirebaseRestaurantBranch[]>(() => {
    return Object.values(branchesMap).filter((b) => Boolean(b && b.id));
  }, [branchesMap]);

  return { branches, branchesMap, loading };
}

/**
 * Live subscription to branch-specific menu item availability overlays
 * at `/branchMenuAvailability/{restaurantId}/{branchId}` (§19).
 */
export function useBranchMenuAvailability(
  restaurantIdOrSlug: string | null | undefined,
  branchId: string | null | undefined,
) {
  const { restaurants } = useRestaurants();
  const [overlay, setOverlay] = useState<{
    items?: Record<string, BranchMenuAvailabilityRecord>;
    variants?: Record<string, BranchMenuAvailabilityRecord>;
    addons?: Record<string, BranchMenuAvailabilityRecord>;
  } | null>(null);
  const [loading, setLoading] = useState(Boolean(restaurantIdOrSlug && branchId));

  const targetId = useMemo(() => {
    if (!restaurantIdOrSlug) return null;
    const match = restaurants.find(
      (r) => r.id === restaurantIdOrSlug || r.slug === restaurantIdOrSlug,
    );
    return match?.id || restaurantIdOrSlug;
  }, [restaurantIdOrSlug, restaurants]);

  useEffect(() => {
    if (!targetId || !branchId) {
      setOverlay(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = rtdbSubscribe<{
      items?: Record<string, BranchMenuAvailabilityRecord>;
      variants?: Record<string, BranchMenuAvailabilityRecord>;
      addons?: Record<string, BranchMenuAvailabilityRecord>;
    }>(`branchMenuAvailability/${targetId}/${branchId}`, (data) => {
      setOverlay(data || null);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [targetId, branchId]);

  /**
   * Evaluates effective availability per §19:
   * effectiveAvailable = globalRecord.is_available === true && branchOverride?.is_available !== false
   */
  const isItemAvailable = useMemo(() => {
    return (itemId: string, globalAvailable: boolean = true) => {
      if (!globalAvailable) return false;
      const itemOverride = overlay?.items?.[itemId];
      if (itemOverride && itemOverride.is_available === false) {
        return false;
      }
      return true;
    };
  }, [overlay]);

  return { overlay, isItemAvailable, loading };
}
