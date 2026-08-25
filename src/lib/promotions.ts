import { rtdbGet, rtdbSet, rtdbUpdate, getDb } from "./firebase";
import { doc, runTransaction } from "firebase/firestore";

/* -------------------------------------------------------------------------- */
/*  1. Promotion & Loyalty Data Contracts                                      */
/* -------------------------------------------------------------------------- */

export type PromoType = "percent" | "fixed" | "free_delivery" | "bogo";
export type PromoScope = "platform" | "restaurant" | "first_order";

export interface PromoCampaign {
  id: string;
  code: string; // uppercase, unique — e.g. "WELCOME20"
  name: string;
  description: string | null;
  type: PromoType;
  value: number; // % or ZAR (ignored for free_delivery/bogo)
  scope: PromoScope;
  /** Legacy single-restaurant field. READ VIA promoRestaurantIds(), never directly. */
  restaurant_id: string | null;
  /** Restaurants the coupon works at when scope === "restaurant". Empty otherwise. */
  restaurant_ids: string[] | null;
  min_order: number; // minimum subtotal (R) to apply
  max_discount: number | null; // cap on the discount (R)
  usage_limit: number | null; // total redemptions platform-wide (null = unlimited)
  usage_count: number; // increment atomically on each successful use
  starts_at: string; // ISO 8601
  expires_at: string; // ISO 8601
  is_active: boolean;
  applies_to: "all" | "orders" | "delivery" | "items";
  created_at: string;
  updated_at: string;
}

/** Matches allowed restaurant identifiers against current restaurant context. */
export function matchPromoRestaurant(
  allowedIds: string[],
  restaurant:
    { id?: string | null; slug?: string | null; name?: string | null } | string | null | undefined,
): boolean {
  if (!allowedIds || allowedIds.length === 0) return true;
  if (allowedIds.some((id) => id === "all" || id === "platform" || id === "*")) return true;
  if (!restaurant) return true;

  const candidateStrings = (
    typeof restaurant === "string"
      ? [restaurant]
      : ([restaurant.id, restaurant.slug, restaurant.name].filter(Boolean) as string[])
  ).flatMap((s) => [
    s.toLowerCase().trim(),
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .trim(),
  ]);

  return allowedIds.some((allowed) => {
    if (!allowed) return false;
    const normAllowed = allowed.toLowerCase().trim();
    const slugAllowed = allowed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .trim();
    return (
      candidateStrings.includes(normAllowed) ||
      candidateStrings.includes(slugAllowed) ||
      candidateStrings.some(
        (c) =>
          c === normAllowed ||
          c === slugAllowed ||
          c.includes(normAllowed) ||
          normAllowed.includes(c),
      )
    );
  });
}

/** Canonical read of a coupon's restaurant allow-list (handles legacy records). */
export function promoRestaurantIds(p: PromoCampaign): string[] {
  if (p.scope !== "restaurant") return [];
  if (Array.isArray(p.restaurant_ids)) return p.restaurant_ids;
  return p.restaurant_id ? [p.restaurant_id] : [];
}

export type ComboKind = "bundle" | "multibuy";
export type ComboDiscountType = "percent" | "fixed";

export interface ComboDeal {
  id: string;
  restaurant_id: string; // combos ALWAYS belong to one restaurant
  name: string; // e.g. "Family Feast" / "3-for-2 Burger Deal"
  description: string | null;
  kind: ComboKind; // missing on old records → treat as "bundle"
  item_ids: string[]; // bundle: 2+ item ids · multibuy: exactly 1 item id
  discount_type: ComboDiscountType | null; // bundle only
  discount_value: number | null; // bundle only (percent 0–100 or R>0)
  buy_qty: number | null; // multibuy only: units the customer receives
  pay_qty: number | null; // multibuy only: units the customer pays for
  is_active: boolean;
  starts_at: string; // ISO 8601
  expires_at: string; // ISO 8601
  created_at: string;
  updated_at: string;
}

export function comboKind(deal: ComboDeal): ComboKind {
  return deal.kind === "multibuy" ? "multibuy" : "bundle";
}

export interface GlobalPointsConfig {
  enabled: boolean;
  method: "none" | "per_order" | "per_item" | "both";
  points_per_order: number; // flat pts per delivered order
  points_per_item_default: number; // pts per item unit (fallback)
  redemption_enabled: boolean;
  points_required: number; // pts needed for one redemption
  discount_percent: number; // % off subtotal when redeemed
  updated_at: string;
  updated_by: string | null;
}

export interface RestaurantPointsOverride {
  restaurant_id: string;
  enabled: boolean; // false = this restaurant opted out
  method: "none" | "per_order" | "per_item" | "both" | null; // null = inherit
  points_per_order: number | null;
  points_per_item_default: number | null;
  redemption_enabled: boolean | null;
  points_required: number | null;
  discount_percent: number | null;
  updated_at: string;
  updated_by: string | null;
}

export interface LoyaltyWallet {
  balance: number;
  lifetime_earned: number;
  lifetime_redeemed: number;
  updated_at: string;
}

export interface LedgerEntry {
  id: string;
  customer_id: string;
  order_id: string | null;
  delta: number; // +earn / -spend
  reason: "earn_order" | "redeem_discount" | "adjustment";
  restaurant_id: string | null;
  balance_after: number;
  created_at: string;
}

export const DEFAULT_GLOBAL_POINTS_CONFIG: GlobalPointsConfig = {
  enabled: true,
  method: "both",
  points_per_order: 15,
  points_per_item_default: 5,
  redemption_enabled: true,
  points_required: 200,
  discount_percent: 15,
  updated_at: new Date().toISOString(),
  updated_by: "system",
};

/** Canonical merge of global rules with per-restaurant overrides (§3.3 of Integration Guide). */
export function resolveEffectivePointsConfig(
  global: GlobalPointsConfig | null | undefined,
  override: RestaurantPointsOverride | null | undefined,
): GlobalPointsConfig & { rewards_disabled_for_restaurant: boolean } {
  const g = global ?? DEFAULT_GLOBAL_POINTS_CONFIG;
  if (!override) return { ...g, rewards_disabled_for_restaurant: false };
  return {
    enabled: Boolean(g.enabled && override.enabled),
    method: override.method ?? g.method,
    points_per_order: override.points_per_order ?? g.points_per_order,
    points_per_item_default: override.points_per_item_default ?? g.points_per_item_default,
    redemption_enabled: Boolean(
      g.redemption_enabled &&
      override.redemption_enabled !== false &&
      (override.redemption_enabled === true || g.redemption_enabled),
    ),
    points_required: override.points_required ?? g.points_required,
    discount_percent: override.discount_percent ?? g.discount_percent,
    updated_at: override.updated_at ?? g.updated_at,
    updated_by: override.updated_by ?? g.updated_by,
    rewards_disabled_for_restaurant: !override.enabled,
  };
}

/** Matches restaurant points override across ID, slug, or name. */
export function findRestaurantPointsOverride(
  overrides: Record<string, RestaurantPointsOverride> | null | undefined,
  restaurantId: string | null | undefined,
  restaurant?:
    { id?: string | null; slug?: string | null; name?: string | null } | null | undefined,
): RestaurantPointsOverride | null {
  if (!overrides || !restaurantId) return null;
  if (overrides[restaurantId]) return overrides[restaurantId] ?? null;

  if (restaurant?.id && overrides[restaurant.id]) return overrides[restaurant.id] ?? null;
  if (restaurant?.slug && overrides[restaurant.slug]) return overrides[restaurant.slug] ?? null;

  const targetKeys = [
    restaurantId.toLowerCase().trim(),
    restaurantId
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .trim(),
    restaurant?.id?.toLowerCase()?.trim(),
    restaurant?.slug?.toLowerCase()?.trim(),
  ].filter(Boolean) as string[];

  for (const [key, val] of Object.entries(overrides)) {
    if (!val) continue;
    const keyNorm = key.toLowerCase().trim();
    const valRestId = (val.restaurant_id || "").toLowerCase().trim();
    if (targetKeys.includes(keyNorm) || targetKeys.includes(valRestId)) {
      return val;
    }
  }

  return null;
}

export interface MenuItemLike {
  id?: string;
  points_value?: number | null;
}

/** Points calculation on delivered order (§6 of Integration Guide). Awarded exclusively on Delivery orders. */
export function calculateOrderEarnedPoints(
  globalConfig: GlobalPointsConfig | null | undefined,
  override: RestaurantPointsOverride | null | undefined,
  order:
    | {
        order_type?: "delivery" | "pickup" | string;
        items?:
          | Array<{ item_id: string; quantity: number }>
          | Record<string, { item_id: string; quantity: number }>;
      }
    | null
    | undefined,
  menuItemsMap?: Map<string, MenuItemLike>,
): number {
  // Gating: Points are awarded ONLY for Delivery orders. Customer Pickup orders earn 0 points.
  if (order?.order_type === "pickup") {
    return 0;
  }

  const eff = resolveEffectivePointsConfig(globalConfig, override);
  let earned = 0;
  if (eff.enabled && !eff.rewards_disabled_for_restaurant) {
    if (eff.method === "per_order" || eff.method === "both") {
      earned += Number(eff.points_per_order) || 0;
    }
    if (eff.method === "per_item" || eff.method === "both") {
      const itemsList = order?.items
        ? Array.isArray(order.items)
          ? order.items
          : Object.values(order.items)
        : [];
      for (const line of itemsList) {
        const item = menuItemsMap?.get(line.item_id);
        const itemPts =
          item?.points_value != null && Number.isFinite(Number(item.points_value))
            ? Number(item.points_value)
            : Number(eff.points_per_item_default) || 0;
        earned += itemPts * (Number(line.quantity) || 1);
      }
    }
  }
  return Math.max(0, Math.round(Number(earned) || 0));
}

/* -------------------------------------------------------------------------- */
/*  2. Promo & Loyalty Calculation Engines                                    */
/* -------------------------------------------------------------------------- */

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface ComboSaving {
  comboId: string;
  name: string;
  kind: ComboKind;
  timesApplied: number;
  discount: number; // total R saved
}

export interface CartItemLike {
  item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  basePrice?: number;
  line_total: number;
}

export function evaluateCombos(
  cart: CartItemLike[],
  restaurantId: string,
  combos: ComboDeal[],
): { savings: ComboSaving[]; totalDiscount: number } {
  const now = Date.now();
  const savings: ComboSaving[] = [];

  for (const deal of combos) {
    if (!deal.is_active) continue;
    // Match either by restaurant_id or if deal is assigned to this restaurant
    if (deal.restaurant_id && deal.restaurant_id !== restaurantId) continue;
    if (deal.starts_at && Date.parse(deal.starts_at) > now) continue;
    if (deal.expires_at && Date.parse(deal.expires_at) < now) continue;

    if (comboKind(deal) === "multibuy") {
      const targetItemId = deal.item_ids?.[0];
      const line = cart.find(
        (l) => l.item_id === targetItemId || (targetItemId && l.item_id.includes(targetItemId)),
      );
      if (!line || deal.buy_qty == null || deal.pay_qty == null) continue;
      if (deal.buy_qty < 2 || deal.pay_qty < 1 || deal.pay_qty >= deal.buy_qty) continue;

      const groups = Math.floor(line.quantity / deal.buy_qty);
      if (groups === 0) continue;

      const freeUnits = groups * (deal.buy_qty - deal.pay_qty);
      const unitSellPrice = line.basePrice || line.unit_price;
      const discount = r2(freeUnits * unitSellPrice);

      savings.push({
        comboId: deal.id,
        name: deal.name,
        kind: "multibuy",
        timesApplied: groups,
        discount,
      });
    } else {
      // bundle: complete sets = min quantity across required items
      if (!deal.item_ids || deal.item_ids.length < 2) continue;
      const matchingLines = deal.item_ids.map((id) =>
        cart.find((l) => l.item_id === id || l.item_id.includes(id)),
      );
      if (matchingLines.some((l) => !l)) continue;

      const sets = Math.min(...matchingLines.map((l) => l!.quantity));
      if (sets <= 0) continue;

      const bundleTotalPerSet = matchingLines.reduce((sum, l) => {
        return sum + (l ? l.basePrice || l.unit_price : 0);
      }, 0);
      if (bundleTotalPerSet <= 0) continue;

      const gross = bundleTotalPerSet * sets;
      const off =
        deal.discount_type === "fixed"
          ? Math.min(gross, Number(deal.discount_value) || 0) * sets
          : gross * (Math.min(100, Math.max(0, Number(deal.discount_value) || 0)) / 100);

      const discount = r2(Math.min(gross, off));
      savings.push({
        comboId: deal.id,
        name: deal.name,
        kind: "bundle",
        timesApplied: sets,
        discount,
      });
    }
  }

  const totalDiscount = r2(savings.reduce((s, x) => s + x.discount, 0));
  return { savings, totalDiscount };
}

export interface CouponResult {
  ok: boolean;
  reason: string | null; // human-readable failure for the UI
  discount: number; // R off items (percent/fixed/bogo) or not used
  freeDelivery: boolean;
  coupon?: PromoCampaign;
}

export function validateAndPriceCoupon(
  p: PromoCampaign | null | undefined,
  ctx: {
    subtotalAfterCombos: number; // items subtotal − step-1 discount
    deliveryFee: number;
    cheapestItemUnit: number; // cheapest cart item unit price (for bogo)
    restaurantId: string;
    restaurant?:
      { id?: string | null; slug?: string | null; name?: string | null } | null | undefined;
    isFirstOrder: boolean;
  },
): CouponResult {
  const fail = (reason: string): CouponResult => ({
    ok: false,
    reason,
    discount: 0,
    freeDelivery: false,
  });

  if (!p) return fail("No coupon entered");
  if (!p.is_active) return fail("This code is no longer active");
  const now = Date.now();
  if (p.starts_at && Date.parse(p.starts_at) > now) return fail("This code is not active yet");
  if (p.expires_at && Date.parse(p.expires_at) < now) return fail("This code has expired");
  if (p.usage_limit != null && p.usage_limit > 0 && (p.usage_count || 0) >= p.usage_limit)
    return fail("This code has reached its maximum redemptions");
  if (p.scope === "restaurant") {
    const allowed = promoRestaurantIds(p);
    const restTarget = ctx.restaurant ?? ctx.restaurantId;
    if (allowed.length > 0 && !matchPromoRestaurant(allowed, restTarget)) {
      return fail("This code is not valid at this restaurant");
    }
  }
  if (p.scope === "first_order" && !ctx.isFirstOrder)
    return fail("This code is for first orders only");
  if (ctx.subtotalAfterCombos < (p.min_order || 0))
    return fail(`Minimum order of R ${(p.min_order || 0).toFixed(2)} required`);

  let discount = 0;
  let freeDelivery = false;
  const pType = (p.type || "percent").toLowerCase();

  switch (pType) {
    case "percent": {
      const pct = Math.min(100, Math.max(0, p.value || 0));
      discount = ctx.subtotalAfterCombos * (pct / 100);
      break;
    }
    case "fixed":
      discount = p.value || 0;
      break;
    case "free_delivery":
    case "delivery":
      freeDelivery = true; // delivery fee becomes 0
      discount = ctx.deliveryFee;
      break;
    case "bogo":
      // buy-one-get-one: cheapest unit on the house
      discount = ctx.cheapestItemUnit > 0 ? ctx.cheapestItemUnit : 0;
      break;
    default:
      discount = ctx.subtotalAfterCombos * ((p.value || 0) / 100);
  }

  if (pType !== "free_delivery" && pType !== "delivery") {
    if (p.max_discount != null && p.max_discount > 0) {
      discount = Math.min(discount, p.max_discount);
    }
    discount = Math.min(discount, ctx.subtotalAfterCombos); // never exceed subtotal
  }

  return { ok: true, reason: null, discount: r2(Math.max(0, discount)), freeDelivery, coupon: p };
}

/* -------------------------------------------------------------------------- */
/*  3. Loyalty Wallet & Ledger Database Operations                            */
/* -------------------------------------------------------------------------- */

export async function getCustomerWallet(customerId: string): Promise<LoyaltyWallet> {
  const db = getDb();
  if (!db || !customerId) {
    return {
      balance: 0,
      lifetime_earned: 0,
      lifetime_redeemed: 0,
      updated_at: new Date().toISOString(),
    };
  }
  try {
    const snap = await rtdbGet<LoyaltyWallet>(`loyalty/wallets/${customerId}`);
    if (snap) {
      return snap;
    }
    const initial: LoyaltyWallet = {
      balance: 0,
      lifetime_earned: 0,
      lifetime_redeemed: 0,
      updated_at: new Date().toISOString(),
    };
    await rtdbSet(`loyalty/wallets/${customerId}`, initial);
    return initial;
  } catch {
    return {
      balance: 0,
      lifetime_earned: 0,
      lifetime_redeemed: 0,
      updated_at: new Date().toISOString(),
    };
  }
}

const inFlightCredits = new Set<string>();

export async function creditLoyaltyPoints(
  customerId: string,
  restaurantId: string,
  points: number,
  orderId: string,
): Promise<void> {
  const db = getDb();
  if (!db || !customerId || points <= 0 || !orderId) return;

  const lockKey = `${customerId}/${orderId}`;
  if (inFlightCredits.has(lockKey)) return;
  inFlightCredits.add(lockKey);

  try {
    // Idempotency flag + wallet increment commit atomically (Firestore transaction)
    const walletRef = doc(db, "loyalty_wallets", customerId);
    const idempotencyRef = doc(db, "loyalty_earned_orders", `${customerId}__${orderId}`);

    let balanceAfter = 0;
    await runTransaction(db, async (tx) => {
      const idempSnap = await tx.get(idempotencyRef);
      if (idempSnap.exists() && idempSnap.data()["done"] === true) {
        return; // Already credited
      }
      const walletSnap = await tx.get(walletRef);
      const cur = (walletSnap.data() as LoyaltyWallet | undefined) || {
        balance: 0,
        lifetime_earned: 0,
        lifetime_redeemed: 0,
        updated_at: new Date().toISOString(),
      };
      balanceAfter = (cur.balance || 0) + points;
      tx.set(walletRef, {
        balance: balanceAfter,
        lifetime_earned: (cur.lifetime_earned || 0) + points,
        lifetime_redeemed: cur.lifetime_redeemed || 0,
        updated_at: new Date().toISOString(),
      });
      tx.set(idempotencyRef, { done: true, order_id: orderId, customer_id: customerId });
    });

    if (!balanceAfter) {
      return; // Transaction was a no-op (already credited)
    }

    const entryId = `ledg_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36).slice(-4)}`;

    await rtdbSet(`loyalty/ledger/${customerId}/${entryId}`, {
      id: entryId,
      customer_id: customerId,
      order_id: orderId,
      delta: points,
      reason: "earn_order",
      restaurant_id: restaurantId,
      balance_after: balanceAfter,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    inFlightCredits.delete(lockKey);
    console.warn("Could not credit loyalty points:", err);
  }
}

export async function redeemLoyaltyPoints(
  customerId: string,
  restaurantId: string,
  points: number,
  orderId: string | null,
): Promise<boolean> {
  const db = getDb();
  if (!db || !customerId || points <= 0) return false;

  const walletRef = doc(db, "loyalty_wallets", customerId);
  let success = false;

  const res = await runTransaction(db, async (tx) => {
    const walletSnap = await tx.get(walletRef);
    const cur = (walletSnap.data() as LoyaltyWallet | undefined) || {
      balance: 0,
      lifetime_earned: 0,
      lifetime_redeemed: 0,
      updated_at: new Date().toISOString(),
    };
    if ((cur.balance || 0) < points) return null; // Abort — insufficient balance
    success = true;
    const next: LoyaltyWallet = {
      balance: Math.max(0, (cur.balance || 0) - points),
      lifetime_earned: cur.lifetime_earned || 0,
      lifetime_redeemed: (cur.lifetime_redeemed || 0) + points,
      updated_at: new Date().toISOString(),
    };
    tx.set(walletRef, next);
    return next;
  });

  if (!res || !success) return false;
  const balanceAfter = res.balance || 0;

  const entryId = `ledg_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36).slice(-4)}`;

  await rtdbSet(`loyalty/ledger/${customerId}/${entryId}`, {
    id: entryId,
    customer_id: customerId,
    order_id: orderId,
    delta: -points,
    reason: "redeem_discount",
    restaurant_id: restaurantId,
    balance_after: balanceAfter,
    created_at: new Date().toISOString(),
  });

  return true;
}

export async function incrementCouponUsage(couponId: string): Promise<void> {
  const db = getDb();
  if (!db || !couponId) return;
  const couponRef = doc(db, "promotions_codes", couponId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(couponRef);
    const count = Number(snap.data()?.["usage_count"] ?? 0);
    tx.set(couponRef, { usage_count: count + 1 }, { merge: true });
  });
}
