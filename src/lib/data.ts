import { rtdbSet } from "./firebase";
import type { DeliveryTier } from "./pricing";
import dishBowl from "@/assets/dish-bowl.jpg";
import dishBurger from "@/assets/dish-burger.jpg";
import dishPizza from "@/assets/dish-pizza.jpg";
import restGrill from "@/assets/rest-grill.jpg";
import restHearth from "@/assets/rest-hearth.jpg";
import restShoyu from "@/assets/rest-shoyu.jpg";
import restSushi from "@/assets/rest-sushi.jpg";
import restTaqueria from "@/assets/rest-taqueria.jpg";

export type { DeliveryTier };

/**
 * Shared domain types plus a live registry that Firebase fills at runtime.
 * All monetary values are ZAR as numbers (e.g. 129.50).
 */

export type OrderStatus =
  | "pending" // placed by customer, awaiting restaurant acceptance
  | "accepted" // restaurant accepted the order
  | "preparing" // kitchen is making it
  | "ready" // ready for pickup
  | "assigned" // driver assigned
  | "picked_up" // driver has the food
  | "on_the_way" // out for delivery
  | "delivered"
  | "cancelled"
  | "refunded";

export type PaymentMethod =
  | "card"
  | "cash_on_delivery"
  | "cash_on_pickup"
  | "eft"
  | "cash"
  | "wallet"
  | "apple_pay"
  | "google_pay"
  | string;

export interface RestaurantPaymentMethodConfig {
  enabled: boolean;
  instructions?: string | null;
}

export interface RestaurantPaymentConfig {
  restaurant_id: string;
  methods: {
    card?: RestaurantPaymentMethodConfig;
    cash_on_delivery?: RestaurantPaymentMethodConfig;
    cash_on_pickup?: RestaurantPaymentMethodConfig;
    eft?: RestaurantPaymentMethodConfig;
    [key: string]: RestaurantPaymentMethodConfig | undefined;
  };
  updated_at?: string;
  updated_by?: string;
}

export type PaymentEvidenceStatus = "pending" | "paid" | "failed" | "refunded";

export interface BranchWeeklyHoursWindow {
  opens_at: string; // "HH:mm"
  closes_at: string; // "HH:mm"
}

export interface BranchAvailability {
  accepting_orders: boolean;
  timezone: string; // e.g. "Africa/Johannesburg"
  temporarily_closed_until: string | null; // ISO-8601
  weekly_hours?: {
    monday?: BranchWeeklyHoursWindow[];
    tuesday?: BranchWeeklyHoursWindow[];
    wednesday?: BranchWeeklyHoursWindow[];
    thursday?: BranchWeeklyHoursWindow[];
    friday?: BranchWeeklyHoursWindow[];
    saturday?: BranchWeeklyHoursWindow[];
    sunday?: BranchWeeklyHoursWindow[];
    [day: string]: BranchWeeklyHoursWindow[] | undefined;
  };
  updated_at?: string;
  updated_by?: string | null;
}

export interface BranchDeliveryTier {
  id: string;
  up_to_km: number;
  fee: number;
  label?: string | null;
}

export interface FirebaseRestaurantBranch {
  id: string; // "main" or "brn_*"
  restaurant_id: string;
  parent_branch_id: string | null; // null for main, "main" for sub-branches
  name: string;
  code: string | null;
  address: string | null;
  city: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  delivery_radius_km: number;
  status: "approved" | "pending" | "suspended" | "rejected";
  is_active: boolean;
  is_main: boolean;
  created_at: string;
  updated_at: string;
  availability?: BranchAvailability | null;
  delivery_tiers?: BranchDeliveryTier[] | null;
}

export interface BranchMenuAvailabilityRecord {
  is_available: boolean;
  updated_at?: string;
  updated_by?: string | null;
}

export interface OrderPaymentEvidence {
  order_id: string;
  receipt_number: string; // "R-" + order.order_number
  method: PaymentMethod;
  amount: number; // final order.total after coupons/combos/points discounts
  currency: "ZAR";
  status: PaymentEvidenceStatus;
  recorded_by: "customer_app" | "console" | string;
  updated_at: string; // ISO string
  paid_at: string | null; // ISO string when paid, null when pending
  gateway?: string | null; // e.g. "demo-gateway"
  reference?: string | null; // e.g. "SIM-8F3K21"
  card_brand?: string | null; // "Visa", "Mastercard", "Amex"
  card_last4?: string | null; // "4242", "4832"
  proof_url?: string | null; // public URL for EFT proof
  notes?: string | null;
}

export interface DeliveryAddress {
  label: string | null; // "Home" | "Work" | "Custom" | null
  street: string;
  city: string;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
}

export interface OrderLineVariant {
  id: string; // variant id from menu
  name: string; // e.g. "Large"
  price_delta: number; // added per unit (Rands)
}

export interface OrderLineAddon {
  id: string; // addon id from menu
  name: string; // e.g. "Extra cheese"
  price: number; // per-unit price (Rands)
  quantity: number;
}

export interface OrderLine {
  id: string; // generate client-side (uid("ln"))
  item_id: string; // MenuItem.id from /menus/{rid}/items/{itemId}
  name: string; // snapshot of item.name at order time
  quantity: number;
  unit_price: number; // base item price (no variant/addons) at order time
  line_total: number; // (unit_price + variant.price_delta) * quantity + Σ(addon.price * addon.qty)
  notes: string | null; // special instructions for this line ("No onions")
  variant: OrderLineVariant | null;
  addons: OrderLineAddon[];
  points_per_item?: number;
  points_per_items?: number;
  points_earned?: number;
}

export interface TimelineEvent {
  id: string;
  status: OrderStatus | "placed" | "note";
  at: string; // ISO timestamp
  note: string | null;
  actor: string | null; // email/uid of who moved the status, or null
}

export interface DriverLiveLocation {
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  updated_at: string;
}

export interface FirebaseOrder {
  id: string; // uid("ord")
  order_number: string; // `FF-${Date.now().toString().slice(-6)}`
  order_type: "delivery" | "pickup"; // "delivery" or "pickup" (§3.5 of Integration Guide)
  status: OrderStatus; // initial status = "pending"
  placed_at: string; // ISO timestamp
  accepted_at: string | null;
  ready_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  eta_minutes: number | null;
  eta_at: string | null; // ISO for absolute ETA
  subtotal: number; // Σ line.line_total
  delivery_fee: number;
  service_fee: number; // 5% of subtotal, rounded to 2 decimals
  tax: number;
  discount: number; // coupon discount (money off), 0 if none
  tip: number;
  total: number; // subtotal + delivery_fee + service_fee + tax + tip - discount
  coupon_code: string | null;
  payment_method: PaymentMethod;
  payment_status: "pending" | "paid" | "failed" | "refunded";
  payment?: OrderPaymentEvidence;
  receipt_number?: string;
  delivery_address: DeliveryAddress | null;
  special_instructions: string | null;
  scheduled_for: string | null;

  // Loyalty points allocation snapshot
  points_per_order?: number;
  points_per_items?: number;

  // Branch snapshot (§13.5 of Multi-Branch Integration Contract)
  branch_id?: string | null;
  branch_name?: string | null;
  branch_code?: string | null;
  branch_address?: string | null;
  branch_city?: string | null;
  branch_phone?: string | null;
  branch_latitude?: number | null;
  branch_longitude?: number | null;
  branch_delivery_radius_km?: number | null;
  delivery_distance_km?: number | null;
  branchId?: string | null;
  restaurantId?: string | null;

  // Restaurant snapshot
  restaurant_id: string;
  restaurant_name: string;
  restaurant_image: string | null;

  // Customer snapshot
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;

  // Driver snapshot
  driver_id: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  driver_photo: string | null;
  driver_rating: number | null;

  created_at: string;
  updated_at: string;
}

export type OptionChoice = { id: string; label: string; delta: number };
export type ExtraChoice = { id: string; label: string; price: number };

export type Dish = {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  popular?: boolean;
  is_available?: boolean;
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
  id?: string;
  slug: string;
  name: string;
  tagline: string;
  cuisines: string[];
  priceBand: "£" | "££" | "£££" | "R" | "RR" | "RRR" | string;
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

  // Delivery tier system fields
  latitude: number | null;
  longitude: number | null;
  delivery_radius_km: number;
  delivery_tiers: DeliveryTier[];
  prep_time_minutes?: number;
  opens_at?: string;
  closes_at?: string;
  delivery_enabled?: boolean;
  pickup_enabled?: boolean;
  status?: "approved" | "pending" | "suspended" | "rejected";
  branches?: FirebaseRestaurantBranch[];
  branch_count?: number;
};

/* ----------------------------- Default Menu Catalog ------------------------------ */

export const DEFAULT_RESTAURANTS: Restaurant[] = [
  {
    id: "hearth-grill",
    slug: "hearth-grill",
    name: "Hearth Grill & Smokehouse",
    tagline: "Wood-fired steaks, double smash burgers & craft sides",
    cuisines: ["Burgers", "Grill", "Steak", "BBQ"],
    priceBand: "RR",
    rating: 4.9,
    reviewCount: 428,
    etaMinutes: [20, 35],
    deliveryFee: 25,
    minOrder: 80,
    distanceKm: 1.8,
    image: restGrill,
    badge: "Top Rated",
    openNow: true,
    hours: "11:00–22:30",
    address: "44 Main St, Johannesburg",
    phone: "+27 11 555 0192",
    categories: ["Popular", "Burgers", "Mains", "Sides", "Drinks"],
    latitude: -26.1952,
    longitude: 28.0345,
    delivery_radius_km: 15,
    delivery_tiers: [
      { id: "hg_tier_1", up_to_km: 5, fee: 15, label: "0–5 km" },
      { id: "hg_tier_2", up_to_km: 10, fee: 25, label: "5–10 km" },
      { id: "hg_tier_3", up_to_km: 15, fee: 35, label: "10–15 km" },
    ],
    prep_time_minutes: 20,
    status: "approved",
    dishes: [
      {
        id: "hg-burger",
        name: "Aged Beef Double Smash Burger",
        description:
          "Two 120g aged beef patties, sharp cheddar, smoked brisket bacon, charred onion relish on brioche.",
        price: 145,
        image: dishBurger,
        popular: true,
        category: "Burgers",
        prepMinutes: 15,
        calories: 840,
        allergens: ["Gluten", "Dairy"],
        ingredients: ["Beef", "Cheddar", "Brioche", "Pickles", "Chipotle Aioli"],
        sizes: [
          { id: "reg", label: "Double Patty (240g)", delta: 0 },
          { id: "triple", label: "Triple Patty (360g)", delta: 35 },
          { id: "wagyu", label: "Wagyu Beef Upgrade", delta: 50 },
        ],
        extras: [
          { id: "bacon", label: "Crispy Brisket Bacon", price: 25 },
          { id: "cheese-sauce", label: "Smoked Jalapeño Cheese Sauce", price: 20 },
          { id: "truffle-mayo", label: "Truffle Aioli Dip", price: 18 },
        ],
      },
      {
        id: "hg-pizza",
        name: "Truffle & Wild Mushroom Sourdough Pizza",
        description:
          "48-hour fermented sourdough, fior di latte, roasted wild forest mushrooms, truffle crema & thyme.",
        price: 165,
        image: dishPizza,
        popular: true,
        category: "Mains",
        diet: "veg",
        prepMinutes: 18,
        calories: 780,
        allergens: ["Gluten", "Dairy"],
        ingredients: [
          "Sourdough Base",
          "Wild Mushrooms",
          "Fior Di Latte",
          "Truffle Crema",
          "Fresh Thyme",
        ],
        sizes: [
          { id: "12in", label: '12" Standard', delta: 0 },
          { id: "14in", label: '14" Large Sharing', delta: 40 },
        ],
        extras: [
          { id: "extra-truffle", label: "Extra Shaved Truffle Oil", price: 30 },
          { id: "prosciutto", label: "Prosciutto Crudo", price: 35 },
        ],
      },
      {
        id: "hg-ribs",
        name: "Slow-Smoked Pork Belly Ribs (500g)",
        description:
          "Hickory-smoked for 6 hours, brushed with bourbon honey glaze, served with house slaw.",
        price: 195,
        image: restGrill,
        popular: true,
        category: "Mains",
        prepMinutes: 20,
        calories: 960,
        allergens: ["Mustard"],
        ingredients: ["Pork Ribs", "Bourbon BBQ Glaze", "Cabbage Slaw"],
        sizes: [
          { id: "half", label: "500g Half Rack", delta: 0 },
          { id: "full", label: "1kg Full Rack", delta: 95 },
        ],
        extras: [
          { id: "cornbread", label: "Honey Butter Cornbread", price: 28 },
          { id: "extra-glaze", label: "Smoky Bourbon Glaze Pot", price: 15 },
        ],
      },
    ],
  },
  {
    id: "shoyu-ramen",
    slug: "shoyu-ramen",
    name: "Shoyu Ramen Bar",
    tagline: "Authentic 18-hour broth ramen, gyoza & donburi bowls",
    cuisines: ["Ramen", "Japanese", "Bowls", "Noodles"],
    priceBand: "RR",
    rating: 4.8,
    reviewCount: 312,
    etaMinutes: [25, 40],
    deliveryFee: 20,
    minOrder: 70,
    distanceKm: 2.3,
    image: restShoyu,
    badge: "Chef's Choice",
    openNow: true,
    hours: "11:30–22:00",
    address: "12 Park Lane, Rosebank",
    phone: "+27 11 555 0834",
    categories: ["Popular", "Ramen", "Sides", "Bowls"],
    latitude: -26.1465,
    longitude: 28.0416,
    delivery_radius_km: 12,
    delivery_tiers: [
      { id: "sr_tier_1", up_to_km: 4, fee: 15, label: "0–4 km" },
      { id: "sr_tier_2", up_to_km: 8, fee: 22, label: "4–8 km" },
      { id: "sr_tier_3", up_to_km: 12, fee: 30, label: "8–12 km" },
    ],
    prep_time_minutes: 18,
    status: "approved",
    dishes: [
      {
        id: "sr-tonkotsu",
        name: "Signature Tonkotsu Shoyu Ramen",
        description:
          "18-hour pork bone broth, slow-cooked chashu pork belly, ajitsuke tamago egg, menma bamboo & nori.",
        price: 138,
        image: dishBowl,
        popular: true,
        category: "Ramen",
        prepMinutes: 14,
        calories: 720,
        allergens: ["Gluten", "Soy", "Egg"],
        ingredients: ["Tonkotsu Broth", "Handmade Noodles", "Chashu Pork", "Soft Egg", "Scallions"],
        sizes: [
          { id: "reg", label: "Regular Bowl", delta: 0 },
          { id: "large", label: "Large Noodles & Double Chashu", delta: 35 },
        ],
        extras: [
          { id: "extra-egg", label: "Marinated Soft Egg", price: 16 },
          { id: "chili-oil", label: "Rayu Chili Crisp Oil", price: 12 },
          { id: "extra-nori", label: "Toasted Nori Sheets", price: 10 },
        ],
      },
    ],
  },
  {
    id: "taqueria-del-sol",
    slug: "taqueria-del-sol",
    name: "Taqueria del Sol",
    tagline: "Birria tacos, loaded burritos & handcrafted guacamole",
    cuisines: ["Tacos", "Mexican", "Burritos"],
    priceBand: "R",
    rating: 4.9,
    reviewCount: 510,
    etaMinutes: [15, 30],
    deliveryFee: 15,
    minOrder: 60,
    distanceKm: 1.2,
    image: restTaqueria,
    badge: "Trending",
    openNow: true,
    hours: "10:30–23:00",
    address: "88 7th Street, Melville",
    phone: "+27 11 555 0411",
    categories: ["Popular", "Tacos", "Burritos", "Sides"],
    latitude: -26.1755,
    longitude: 28.0076,
    delivery_radius_km: 10,
    delivery_tiers: [
      { id: "tds_tier_1", up_to_km: 3, fee: 12, label: "0–3 km" },
      { id: "tds_tier_2", up_to_km: 6, fee: 20, label: "3–6 km" },
      { id: "tds_tier_3", up_to_km: 10, fee: 28, label: "6–10 km" },
    ],
    prep_time_minutes: 15,
    status: "approved",
    dishes: [
      {
        id: "tds-birria",
        name: "Slow-Braised Beef Birria Tacos (3 pcs)",
        description:
          "Crispy griddled corn tortillas dipped in chili broth, melted Oaxaca cheese, slow-cooked beef & rich consommé.",
        price: 135,
        image: restTaqueria,
        popular: true,
        category: "Tacos",
        prepMinutes: 12,
        calories: 680,
        allergens: ["Dairy"],
        ingredients: [
          "Corn Tortillas",
          "Birria Beef",
          "Oaxaca Cheese",
          "Cilantro & Onion",
          "Consommé Dip",
        ],
        sizes: [
          { id: "3pcs", label: "3 Tacos Plate", delta: 0 },
          { id: "4pcs", label: "4 Tacos + Extra Consommé", delta: 35 },
        ],
        extras: [
          { id: "guac", label: "Fresh Lime Guacamole", price: 25 },
          { id: "pico", label: "Fire-Roasted Pico de Gallo", price: 15 },
        ],
      },
    ],
  },
  {
    id: "sakura-sushi",
    slug: "sakura-sushi",
    name: "Sakura Sushi & Robata",
    tagline: "Artisan nigiri, specialty dragon rolls & sashimi",
    cuisines: ["Sushi", "Japanese", "Seafood"],
    priceBand: "RRR",
    rating: 4.9,
    reviewCount: 389,
    etaMinutes: [25, 40],
    deliveryFee: 30,
    minOrder: 100,
    distanceKm: 3.1,
    image: restSushi,
    badge: "Premium",
    openNow: true,
    hours: "12:00–22:00",
    address: "21 Sandton City, Sandton",
    phone: "+27 11 555 0922",
    categories: ["Popular", "Specialty Rolls", "Nigiri", "Sashimi"],
    latitude: -26.1076,
    longitude: 28.0567,
    delivery_radius_km: 15,
    delivery_tiers: [
      { id: "ss_tier_1", up_to_km: 5, fee: 20, label: "0–5 km" },
      { id: "ss_tier_2", up_to_km: 10, fee: 30, label: "5–10 km" },
      { id: "ss_tier_3", up_to_km: 15, fee: 40, label: "10–15 km" },
    ],
    prep_time_minutes: 22,
    status: "approved",
    dishes: [
      {
        id: "ss-dragon",
        name: "Flame-Torched Salmon Dragon Roll (8 pcs)",
        description:
          "Tempura prawn and avocado inside, draped with torched Atlantic salmon, unagi glaze, spicy kewpie & tobiko.",
        price: 148,
        image: restSushi,
        popular: true,
        category: "Specialty Rolls",
        prepMinutes: 16,
        calories: 520,
        allergens: ["Seafood", "Soy", "Gluten"],
        ingredients: ["Sushi Rice", "Tempura Prawn", "Salmon", "Avocado", "Unagi Sauce", "Tobiko"],
        sizes: [
          { id: "8pcs", label: "8 Pieces Roll", delta: 0 },
          { id: "12pcs", label: "12 Pieces Deluxe", delta: 45 },
        ],
        extras: [
          { id: "spicy-mayo", label: "Spicy Kewpie Mayo Dip", price: 14 },
          { id: "edamame", label: "Steamed Sea Salt Edamame", price: 32 },
        ],
      },
    ],
  },
  {
    id: "hearth-artisan",
    slug: "hearth-artisan",
    name: "Hearth Artisan Kitchen",
    tagline: "Farm-to-table salads, organic grain bowls & fresh sourdough",
    cuisines: ["Bowls", "Healthy", "Salads", "Vegan"],
    priceBand: "RR",
    rating: 4.8,
    reviewCount: 260,
    etaMinutes: [20, 35],
    deliveryFee: 20,
    minOrder: 75,
    distanceKm: 1.9,
    image: restHearth,
    badge: "Eco Friendly",
    openNow: true,
    hours: "08:00–21:00",
    address: "15 Cradock Ave, Rosebank",
    phone: "+27 11 555 0377",
    categories: ["Popular", "Grain Bowls", "Salads", "Smoothies"],
    latitude: -26.148,
    longitude: 28.043,
    delivery_radius_km: 14,
    delivery_tiers: [
      { id: "ha_tier_1", up_to_km: 4, fee: 15, label: "0–4 km" },
      { id: "ha_tier_2", up_to_km: 9, fee: 25, label: "4–9 km" },
      { id: "ha_tier_3", up_to_km: 14, fee: 35, label: "9–14 km" },
    ],
    prep_time_minutes: 16,
    status: "approved",
    dishes: [
      {
        id: "ha-bowl",
        name: "Teriyaki Salmon & Avocado Grain Bowl",
        description:
          "Miso-glazed Atlantic salmon, tri-colour quinoa, creamy avocado, edamame, pickled cucumber and sesame dressing.",
        price: 155,
        image: dishBowl,
        popular: true,
        category: "Grain Bowls",
        diet: "gf",
        prepMinutes: 14,
        calories: 610,
        allergens: ["Fish", "Soy", "Sesame"],
        ingredients: [
          "Grilled Salmon",
          "Quinoa",
          "Avocado",
          "Edamame",
          "Pickled Cucumber",
          "Sesame Ginger Dressing",
        ],
        sizes: [
          { id: "reg", label: "Regular Bowl", delta: 0 },
          { id: "protein", label: "Double Salmon Protein Boost", delta: 45 },
        ],
        extras: [
          { id: "extra-avocado", label: "Half Hass Avocado", price: 22 },
          { id: "sesame-dressing", label: "Extra Sesame Ginger Dressing", price: 12 },
        ],
      },
    ],
  },
];

/* ----------------------------- live registry ------------------------------ */

let registry: Restaurant[] = [...DEFAULT_RESTAURANTS];

/** Called by the Firebase sync layer whenever restaurant data changes. */
export function registerRestaurants(next: Restaurant[]) {
  if (next && next.length > 0) {
    registry = next;
  }
}

export function restaurants() {
  return registry.length > 0 ? registry : DEFAULT_RESTAURANTS;
}

export function getRestaurant(slugOrId: string) {
  if (!slugOrId) return undefined;
  const q = slugOrId.toLowerCase().trim();
  return (
    restaurants().find(
      (r) =>
        r.slug.toLowerCase() === q ||
        (r.id && r.id.toLowerCase() === q) ||
        r.name.toLowerCase() === q,
    ) ??
    DEFAULT_RESTAURANTS.find(
      (r) =>
        r.slug.toLowerCase() === q ||
        (r.id && r.id.toLowerCase() === q) ||
        r.name.toLowerCase() === q,
    )
  );
}

export function allDishes() {
  return restaurants().flatMap((r) => r.dishes.map((d) => ({ dish: d, restaurant: r })));
}

export function findDish(dishId: string) {
  return allDishes().find((entry) => entry.dish.id === dishId);
}

export type Coupon = { type: "percent" | "fixed" | "delivery"; value: number };

/** Coupon codes synchronized from Firebase promotions/coupons nodes. */
export const coupons: Record<string, Coupon> = {
  HEARTH50: { type: "percent", value: 50 },
  WELCOME20: { type: "percent", value: 20 },
  FREEDELIVERY: { type: "delivery", value: 0 },
};

export function registerCoupons(next: Record<string, Coupon>) {
  if (next && Object.keys(next).length > 0) {
    Object.keys(coupons).forEach((key) => delete coupons[key]);
    Object.assign(coupons, next);
  }
}

/** Formats numbers as South African Rands (ZAR). */
export function money(value: number | undefined | null) {
  const num = typeof value === "number" && !Number.isNaN(value) ? value : 0;
  return `R ${num.toFixed(2)}`;
}

export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

export async function placeFirebaseOrder(input: {
  restaurant: { id: string; name: string; image: string | null };
  branch?: {
    id: string;
    name: string;
    code?: string | null;
    address?: string | null;
    city?: string | null;
    phone?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    delivery_radius_km?: number | null;
    distance_km?: number | null;
  } | null;
  customer: { uid: string | null; name: string; phone: string | null; email: string | null };
  items: Array<{
    item_id: string;
    name: string;
    quantity: number;
    unit_price: number;
    notes: string | null;
    variant: OrderLineVariant | null;
    addons: OrderLineAddon[];
    points_per_item?: number;
    points_per_items?: number;
    points_earned?: number;
  }>;
  order_type?: "delivery" | "pickup";
  delivery_address: DeliveryAddress | null;
  special_instructions: string | null;
  payment_method: PaymentMethod;
  payment_status?: "pending" | "paid";
  payment_gateway?: string | null;
  payment_reference?: string | null;
  card_brand?: string | null;
  card_last4?: string | null;
  payment_proof_url?: string | null;
  payment_notes?: string | null;
  coupon_code?: string | null;
  discount?: number;
  tip?: number;
  delivery_fee: number;
  eta_minutes?: number | null;
  eta_at?: string | null;
  points_per_order?: number;
  points_per_items?: number;
}): Promise<string> {
  const orderId = uid("ord");
  const ts = new Date().toISOString();
  const orderNumber = `FF-${Date.now().toString().slice(-6)}`;
  const order_type = input.order_type || (input.delivery_address ? "delivery" : "pickup");
  const isDelivery = order_type === "delivery";

  const lines: Record<string, OrderLine> = {};
  let subtotal = 0;
  for (const it of input.items) {
    const addonTotal = (it.addons || []).reduce(
      (s, a) => s + (a.price || 0) * (a.quantity || 1),
      0,
    );
    const variantDelta = (it.variant?.price_delta ?? 0) * it.quantity;
    const line_total =
      Math.round(((it.unit_price || 0) * it.quantity + addonTotal + variantDelta) * 100) / 100;
    subtotal += line_total;
    const lineId = uid("ln");
    const itemPts = isDelivery ? Number(it.points_per_items ?? it.points_per_item ?? 0) : 0;
    lines[lineId] = {
      id: lineId,
      line_total,
      ...it,
      points_per_item: itemPts,
      points_per_items: itemPts,
      points_earned: itemPts * (it.quantity || 1),
    };
  }
  subtotal = Math.round(subtotal * 100) / 100;
  const delivery_fee =
    order_type === "pickup" ? 0 : Math.round(Number(input.delivery_fee || 0) * 100) / 100;
  const service_fee = Math.round(subtotal * 0.05 * 100) / 100;
  const tax = 0;
  const tip = order_type === "pickup" ? 0 : Math.round(Number(input.tip || 0) * 100) / 100;
  const discount = Math.round(Number(input.discount || 0) * 100) / 100;
  const total = Math.max(
    0,
    Math.round((subtotal + delivery_fee + service_fee + tax + tip - discount) * 100) / 100,
  );

  const isCard =
    input.payment_method === "card" ||
    input.payment_method === "apple_pay" ||
    input.payment_method === "wallet" ||
    input.payment_method === "google_pay";

  const paymentStatus: PaymentEvidenceStatus =
    input.payment_status ?? (isCard ? "paid" : "pending");

  const receiptNumber = `R-${orderNumber}`;

  const paymentEvidence: OrderPaymentEvidence = {
    order_id: orderId,
    receipt_number: receiptNumber,
    method: input.payment_method,
    amount: total,
    currency: "ZAR",
    status: paymentStatus,
    recorded_by: "customer_app",
    updated_at: ts,
    paid_at: paymentStatus === "paid" ? ts : null,
    gateway: isCard ? input.payment_gateway || "demo-gateway" : null,
    reference: isCard
      ? input.payment_reference || `SIM-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
      : null,
    card_brand: isCard ? input.card_brand || "Visa" : null,
    card_last4: isCard ? input.card_last4 || "4242" : null,
    proof_url: input.payment_proof_url || null,
    notes: input.payment_notes || null,
  };

  // Branch snapshot (§13.5 of Multi-Branch Integration Contract)
  const branchData = input.branch;
  const branchId = branchData?.id || "main";
  const branchName = branchData?.name || input.restaurant.name;
  const branchCode = branchData?.code ?? (branchId === "main" ? "MAIN" : null);
  const branchAddress = branchData?.address ?? null;
  const branchCity = branchData?.city ?? "Johannesburg";
  const branchPhone = branchData?.phone ?? null;
  const branchLatitude = branchData?.latitude != null ? Number(branchData.latitude) : 0;
  const branchLongitude = branchData?.longitude != null ? Number(branchData.longitude) : 0;
  const branchDeliveryRadius =
    branchData?.delivery_radius_km != null ? Number(branchData.delivery_radius_km) : 10;
  const deliveryDistanceKm = isDelivery ? (branchData?.distance_km ?? null) : null;

  const order: FirebaseOrder = {
    id: orderId,
    order_number: orderNumber,
    order_type,
    status: "pending",
    placed_at: ts,
    accepted_at: null,
    ready_at: null,
    picked_up_at: null,
    delivered_at: null,
    cancelled_at: null,
    eta_minutes: input.eta_minutes ?? null,
    eta_at: input.eta_at ?? null,
    subtotal,
    delivery_fee,
    service_fee,
    tax,
    discount,
    tip,
    total,
    coupon_code: input.coupon_code ?? null,
    payment_method: input.payment_method,
    payment_status: paymentStatus,
    payment: paymentEvidence,
    receipt_number: receiptNumber,
    delivery_address: order_type === "pickup" ? null : input.delivery_address,
    special_instructions: input.special_instructions ?? null,
    scheduled_for: null,
    points_per_order: isDelivery ? Number(input.points_per_order || 0) : 0,
    points_per_items: isDelivery ? Number(input.points_per_items || 0) : 0,

    // Branch snapshot fields (§13.5 of Multi-Branch Integration Contract)
    branch_id: branchId,
    branch_name: branchName,
    branch_code: branchCode,
    branch_address: branchAddress,
    branch_city: branchCity,
    branch_phone: branchPhone,
    branch_latitude: branchLatitude,
    branch_longitude: branchLongitude,
    branch_delivery_radius_km: branchDeliveryRadius,
    delivery_distance_km: deliveryDistanceKm,

    // Dual camelCase aliases for Admin UI queries (§6 & §11 of Master Prompt)
    branchId: branchId,
    restaurantId: input.restaurant.id,

    restaurant_id: input.restaurant.id,
    restaurant_name: input.restaurant.name,
    restaurant_image: input.restaurant.image,
    customer_id: input.customer.uid,
    customer_name: input.customer.name,
    customer_phone: input.customer.phone,
    customer_email: input.customer.email,
    driver_id: null,
    driver_name: null,
    driver_phone: null,
    driver_photo: null,
    driver_rating: null,
    created_at: ts,
    updated_at: ts,
  };

  await rtdbSet(`orders/${orderId}`, order);
  await rtdbSet(`orders/${orderId}/items`, lines);
  await rtdbSet(`orders/${orderId}/payment`, paymentEvidence);
  await rtdbSet(`orders/${orderId}/timeline/${uid("tl")}`, {
    id: uid("tl"),
    status: "placed",
    at: ts,
    note:
      order_type === "pickup"
        ? "Pickup order placed by customer"
        : `Delivery order placed by customer (${branchName})`,
    actor: input.customer.uid,
  });

  return orderId;
}
