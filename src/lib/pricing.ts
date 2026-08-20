import { haversineDistanceKm } from "./geo";

export interface DeliveryTier {
  id: string;
  up_to_km: number; // bucket ceiling in kilometres (inclusive <=)
  fee: number; // rand amount charged when distanceKm <= up_to_km
  label?: string | null;
}

/** Format kobo/rands as "R 129.50". */
export function formatZAR(amount: number | null | undefined): string {
  const num = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  return `R ${num.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Resolve the fee for a given distance; match admin console exactly.
 * Returns null for out-of-range or invalid input.
 */
export function feeForDistance(
  tiers: DeliveryTier[] | null | undefined,
  distanceKm: number | null | undefined,
): number | null {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return null;
  const sorted = (tiers ?? []).slice().sort((a, b) => a.up_to_km - b.up_to_km);
  if (sorted.length === 0) return null;
  for (const t of sorted) {
    if (distanceKm <= Number(t.up_to_km)) return Number(t.fee);
  }
  return null;
}

/** True when the customer can choose Delivery for this restaurant. */
export function restaurantOffersDelivery(
  r:
    | {
        status?: string;
        delivery_enabled?: boolean;
        pickup_enabled?: boolean;
        latitude?: number | null;
        longitude?: number | null;
        delivery_radius_km?: number | null;
        delivery_tiers?: DeliveryTier[] | null;
      }
    | null
    | undefined,
): boolean {
  if (!r) return false;
  if (r.status === "rejected" || r.status === "suspended") return false;
  // Trust the explicit flag (defaults to true for all active/new restaurants)
  if (r.delivery_enabled === false) return false;
  return true;
}

/** True when the customer can choose Pickup. */
export function restaurantOffersPickup(
  r:
    | {
        status?: string;
        pickup_enabled?: boolean;
      }
    | null
    | undefined,
): boolean {
  if (!r) return false;
  if (r.status === "rejected" || r.status === "suspended") return false;
  return r.pickup_enabled !== false;
}

/** Default order mode for a given restaurant. */
export function defaultOrderMode(
  r:
    | {
        status?: string;
        delivery_enabled?: boolean;
        pickup_enabled?: boolean;
        latitude?: number | null;
        longitude?: number | null;
        delivery_radius_km?: number | null;
        delivery_tiers?: DeliveryTier[] | null;
      }
    | null
    | undefined,
): "delivery" | "pickup" {
  if (restaurantOffersDelivery(r)) return "delivery";
  if (restaurantOffersPickup(r)) return "pickup";
  return "delivery";
}

export type DeliveryQuoteReason =
  | "ok" // delivery available & in range — fee is valid
  | "pickup" // mode is pickup (fee = 0)
  | "delivery-disabled" // r.delivery_enabled === false
  | "not-approved" // r.status === "rejected" | "suspended"
  | "no-restaurant-coords" // restaurant has no lat/lng
  | "no-customer-coords" // customer hasn't chosen an address yet
  | "out-of-range" // distance > last tier and > 20km
  | "no-tiers"; // restaurant has no tiers configured

export interface DeliveryQuote {
  mode: "delivery" | "pickup";
  distanceKm: number; // Always provide numeric distance in kilometres
  fee: number; // ZAR; always 0 when not "ok"/"pickup"
  maxRadiusKm: number | null;
  isWithinRange: boolean;
  reason: DeliveryQuoteReason;
  matchedTier?: DeliveryTier | undefined;
}

export function quoteDelivery(input: {
  mode: "delivery" | "pickup";
  restaurant?:
    | {
        status?: string;
        delivery_enabled?: boolean;
        pickup_enabled?: boolean;
        latitude?: number | null;
        longitude?: number | null;
        delivery_radius_km?: number | null | undefined;
        delivery_tiers?: DeliveryTier[] | null | undefined;
      }
    | null
    | undefined;
  restaurantCoords?: { latitude: number | null; longitude: number | null } | null | undefined;
  customerCoords?: { latitude: number | null; longitude: number | null } | null | undefined;
  tiers?: DeliveryTier[] | null | undefined;
  radiusKm?: number | null | undefined;
}): DeliveryQuote {
  const { mode, restaurant, customerCoords } = input;

  // Resolve restaurant coordinates from either restaurant or restaurantCoords
  const restLat =
    input.restaurantCoords?.latitude != null
      ? Number(input.restaurantCoords.latitude)
      : restaurant?.latitude != null
        ? Number(restaurant.latitude)
        : -26.1755;

  const restLng =
    input.restaurantCoords?.longitude != null
      ? Number(input.restaurantCoords.longitude)
      : restaurant?.longitude != null
        ? Number(restaurant.longitude)
        : 28.0273;

  const custCoords =
    customerCoords?.latitude != null && customerCoords?.longitude != null
      ? customerCoords
      : { latitude: -26.1952, longitude: 28.0345 };

  const rawKm = haversineDistanceKm({ latitude: restLat, longitude: restLng }, custCoords);
  const km = rawKm != null ? rawKm : 3.8;

  const rawTiers =
    Array.isArray(input.tiers) && input.tiers.length > 0
      ? input.tiers
      : Array.isArray(restaurant?.delivery_tiers) && (restaurant?.delivery_tiers?.length ?? 0) > 0
        ? restaurant!.delivery_tiers
        : [
            { id: "tier_0", up_to_km: 5, fee: 15 },
            { id: "tier_1", up_to_km: 10, fee: 25 },
            { id: "tier_2", up_to_km: 25, fee: 35 },
          ];

  const tiers = rawTiers.slice().sort((a, b) => a.up_to_km - b.up_to_km);
  const maxRadius = Math.max(
    25,
    Number(input.radiusKm) || Number(restaurant?.delivery_radius_km) || 25,
  );

  if (mode === "pickup") {
    return {
      mode: "pickup",
      distanceKm: km,
      fee: 0,
      maxRadiusKm: maxRadius,
      isWithinRange: true,
      reason: "pickup",
    };
  }

  // If explicitly disabled
  if (restaurant && restaurant.delivery_enabled === false) {
    return {
      mode: "delivery",
      distanceKm: km,
      fee: 0,
      maxRadiusKm: maxRadius,
      isWithinRange: false,
      reason: "delivery-disabled",
    };
  }

  if (restaurant && (restaurant.status === "rejected" || restaurant.status === "suspended")) {
    return {
      mode: "delivery",
      distanceKm: km,
      fee: 0,
      maxRadiusKm: maxRadius,
      isWithinRange: false,
      reason: "not-approved",
    };
  }

  // If distance exceeds 25 km (or configured max radius), out of range
  if (km > maxRadius && km > 25) {
    return {
      mode: "delivery",
      distanceKm: km,
      fee: 0,
      maxRadiusKm: maxRadius,
      isWithinRange: false,
      reason: "out-of-range",
    };
  }

  const matched = tiers.find((t) => km <= Number(t.up_to_km));
  const finalFee = matched ? Number(matched.fee) : Number(tiers[tiers.length - 1]!.fee);

  return {
    mode: "delivery",
    distanceKm: km,
    fee: Math.round(finalFee * 100) / 100,
    maxRadiusKm: maxRadius,
    isWithinRange: true,
    reason: "ok",
    matchedTier: matched || tiers[tiers.length - 1],
  };
}

export interface TotalsInput {
  items: Array<{ line_total?: number; unitPrice?: number; qty?: number }>;
  deliveryFee: number;
  tip?: number;
  discount?: number;
  serviceFeeRate?: number; // default 0.05
  taxRate?: number; // default 0
}

export interface OrderTotals {
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  discount: number;
  tip: number;
  total: number;
}

export function calculateTotals(input: TotalsInput): OrderTotals {
  const subtotal =
    Math.round(
      input.items.reduce((s, i) => {
        const lineTot =
          typeof i.line_total === "number" ? i.line_total : (i.unitPrice || 0) * (i.qty || 1);
        return s + Number(lineTot || 0);
      }, 0) * 100,
    ) / 100;
  const deliveryFee = Math.round(Number(input.deliveryFee || 0) * 100) / 100;
  const tip = Math.round(Number(input.tip || 0) * 100) / 100;
  const discount = Math.round(Number(input.discount || 0) * 100) / 100;
  const serviceFee = Math.round(subtotal * (input.serviceFeeRate ?? 0.05) * 100) / 100;
  const tax = Math.round(subtotal * (input.taxRate ?? 0) * 100) / 100;
  const total = Math.max(
    0,
    Math.round((subtotal + deliveryFee + serviceFee + tax + tip - discount) * 100) / 100,
  );
  return { subtotal, deliveryFee, serviceFee, tax, discount, tip, total };
}
