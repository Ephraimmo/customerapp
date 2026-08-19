import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  coupons,
  getRestaurant,
  placeFirebaseOrder,
  type DeliveryAddress,
  type Dish,
  type FirebaseOrder,
  type FirebaseRestaurantBranch,
  type OrderLine,
  type OrderLineAddon,
  type OrderLineVariant,
  type OrderStatus,
  type PaymentMethod,
  type Restaurant,
} from "./data";
import { useAuth } from "./auth";
import { useLocation } from "./location";
import { calculateTotals, quoteDelivery, type DeliveryQuote, type OrderTotals } from "./pricing";
import { selectBestBranch, type BranchSelectionResult } from "./branch-selector";
import { useRestaurantBranches } from "./firebase-adapters";
import {
  calculateOrderEarnedPoints,
  creditLoyaltyPoints,
  evaluateCombos,
  findRestaurantPointsOverride,
  getCustomerWallet,
  incrementCouponUsage,
  redeemLoyaltyPoints,
  resolveEffectivePointsConfig,
  validateAndPriceCoupon,
  type ComboSaving,
  type GlobalPointsConfig,
  type LoyaltyWallet,
  type PromoCampaign,
  type RestaurantPointsOverride,
} from "./promotions";
import {
  useComboDeals,
  usePointsConfig,
  usePromoCampaigns,
  useRestaurantPointsOverrides,
} from "./firebase-adapters";
import { get, getDb, ref, rtdbSet, rtdbSubscribe, set } from "./firebase";

export type CartLine = {
  lineId: string;
  dishId: string;
  restaurantSlug: string;
  name: string;
  image: string;
  basePrice: number;
  unitPrice: number;
  sizeLabel: string;
  variant: OrderLineVariant | null;
  addons: OrderLineAddon[];
  extras: string[];
  removed: string[];
  notes: string;
  qty: number;
};

export type AddLineInput = {
  dish: Dish;
  restaurantSlug: string;
  sizeId: string;
  extraIds: string[];
  removed: string[];
  notes: string;
  qty: number;
};

export type AddLineOptions = {
  forceReplace?: boolean;
};

export type CartConflictInfo = {
  currentRestaurantSlug: string;
  currentRestaurantName: string;
  itemCount: number;
  subtotal: number;
  itemsSummary: string[];
  newRestaurantSlug: string;
  newRestaurantName: string;
};

export type AddLineResult = {
  success: boolean;
  conflict?: CartConflictInfo;
  replaced?: boolean;
};

export type OrderStage =
  | "placed"
  | "pending"
  | "accepted"
  | "preparing"
  | "ready"
  | "assigned"
  | "picked_up"
  | "on_the_way"
  | "delivered"
  | "cancelled"
  | "refunded";

export type Order = FirebaseOrder & {
  lines: CartLine[];
};

type CartState = {
  lines: CartLine[];
  restaurantSlug: string | null;
  restaurant: Restaurant | undefined;
  currentRestaurantName: string | undefined;
  tip: number;
  couponCode: string | null;
  couponReason: string | null;
  mode: "delivery" | "pickup";
  setMode: (mode: "delivery" | "pickup") => void;
  hasConflict: (newRestaurantSlug: string) => boolean;
  addLine: (input: AddLineInput, options?: AddLineOptions) => AddLineResult;
  clearAndAddLine: (input: AddLineInput) => AddLineResult;
  setQty: (lineId: string, qty: number) => void;
  removeLine: (lineId: string) => void;
  clear: () => void;
  setTip: (tip: number) => void;
  applyCoupon: (code: string) => { ok: boolean; reason?: string };
  removeCoupon: () => void;
  itemCount: number;
  // Promotions & Loyalty States (§5 of Integration Guide)
  comboSavings: ComboSaving[];
  comboDiscount: number;
  couponDiscount: number;
  isFreeDeliveryCoupon: boolean;
  pointsDiscount: number;
  wantsToRedeemPoints: boolean;
  setWantsToRedeemPoints: (redeem: boolean) => void;
  pointsConfig: GlobalPointsConfig;
  pointsEarningsPreview: number;
  customerWallet: LoyaltyWallet;
  // Multi-branch fulfillment state (§10 & §14 of Integration Contract)
  selectedBranch: FirebaseRestaurantBranch | null;
  branchSelectionResult: BranchSelectionResult;
  branchId: string | null;
  quotedDistanceKm: number | null;
  // Derived delivery quote & totals from pricing tier engine
  quote: DeliveryQuote;
  totals: OrderTotals;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  discount: number;
  total: number;
  deliveryEtaMinutes: number;
  canCheckout: boolean;
  orders: FirebaseOrder[];
  placedOrderIds: string[];
  placeOrder: (input: {
    address: DeliveryAddress | string;
    mode: "delivery" | "pickup";
    paymentMethod?: PaymentMethod | undefined;
    specialInstructions?: string | null | undefined;
    paymentProofUrl?: string | null | undefined;
    paymentNotes?: string | null | undefined;
    paymentGateway?: string | null | undefined;
    paymentReference?: string | null | undefined;
    cardBrand?: string | null | undefined;
    cardLast4?: string | null | undefined;
  }) => Promise<string>;
  getOrder: (id: string) => FirebaseOrder | undefined;
  syncing: boolean;
  storage: "cloud" | "local";
};

const CartContext = createContext<CartState | null>(null);

const CART_KEY = "hearth.cart.v4";
const PLACED_ORDERS_KEY = "hearth.placed_orders.v4";

type StoredCart = {
  lines: CartLine[];
  tip: number;
  couponCode: string | null;
  mode?: "delivery" | "pickup";
  wantsToRedeemPoints?: boolean;
};

function cartPath(uid: string) {
  return `customerCarts/${uid}`;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Normalizes cart lines from raw storage. */
function normalizeLines(value: unknown): CartLine[] {
  const raw = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.values(value)
      : [];
  return raw
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
    .map((l) => ({
      lineId: String(l["lineId"] ?? `line-${Math.random().toString(36).slice(2)}`),
      dishId: String(l["dishId"] ?? ""),
      restaurantSlug: String(l["restaurantSlug"] ?? ""),
      name: String(l["name"] ?? "Item"),
      image: String(l["image"] ?? ""),
      basePrice: Number(l["basePrice"] ?? l["unitPrice"] ?? 0),
      unitPrice: Number(l["unitPrice"] ?? 0),
      sizeLabel: String(l["sizeLabel"] ?? "Regular"),
      variant: (l["variant"] as OrderLineVariant) ?? null,
      addons: Array.isArray(l["addons"]) ? (l["addons"] as OrderLineAddon[]) : [],
      extras: Array.isArray(l["extras"]) ? (l["extras"] as string[]) : [],
      removed: Array.isArray(l["removed"]) ? (l["removed"] as string[]) : [],
      notes: String(l["notes"] ?? ""),
      qty: Number(l["qty"] ?? 1),
    }));
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, hydrated: authHydrated } = useAuth();
  const { activeLocation, gpsCoordinates } = useLocation();

  // Promotions & Loyalty Real-time Data
  const campaigns = usePromoCampaigns();
  const rawCombos = useComboDeals();
  const pointsConfig = usePointsConfig();
  const pointsOverrides = useRestaurantPointsOverrides();

  const [lines, setLines] = useState<CartLine[]>([]);
  const [tip, setTip] = useState(0);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [couponReason, setCouponReason] = useState<string | null>(null);
  const [mode, setMode] = useState<"delivery" | "pickup">("delivery");
  const [wantsToRedeemPoints, setWantsToRedeemPoints] = useState(false);
  const [placedOrderIds, setPlacedOrderIds] = useState<string[]>([]);
  const [firebaseOrders, setFirebaseOrders] = useState<Record<string, FirebaseOrder>>({});
  const [customerWallet, setCustomerWallet] = useState<LoyaltyWallet>({
    balance: 0,
    lifetime_earned: 0,
    lifetime_redeemed: 0,
    updated_at: new Date().toISOString(),
  });
  const [hydrated, setHydrated] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);

  // Initialize from local storage
  useEffect(() => {
    const cart = read<StoredCart>(CART_KEY, {
      lines: [],
      tip: 0,
      couponCode: null,
      mode: "delivery",
      wantsToRedeemPoints: false,
    });
    setLines(cart.lines ?? []);
    setTip(cart.tip ?? 0);
    setCouponCode(cart.couponCode ?? null);
    if (cart.mode) setMode(cart.mode);
    if (cart.wantsToRedeemPoints) setWantsToRedeemPoints(cart.wantsToRedeemPoints);
    setPlacedOrderIds(read<string[]>(PLACED_ORDERS_KEY, []));
    setHydrated(true);
  }, []);

  // Fetch / subscribe to customer loyalty wallet
  useEffect(() => {
    if (!hydrated) return;
    const cid = user?.uid || "guest_customer";
    void getCustomerWallet(cid).then((w) => setCustomerWallet(w));

    return rtdbSubscribe<LoyaltyWallet>(`loyalty/wallets/${cid}`, (snap) => {
      if (snap) {
        setCustomerWallet(snap);
      }
    });
  }, [user, hydrated]);

  // Listen to all orders from Firebase Realtime Database
  useEffect(() => {
    if (!hydrated) return;
    const unsubscribe = rtdbSubscribe<Record<string, FirebaseOrder>>("orders", (all) => {
      setFirebaseOrders(all ?? {});
    });
    return () => unsubscribe();
  }, [hydrated]);

  // Credit loyalty points when delivery orders transition to "delivered" (§6 & §9 of Integration Guide)
  useEffect(() => {
    if (!hydrated) return;
    const cid = user?.uid || "guest_customer";
    const allOrders = Object.values(firebaseOrders);

    allOrders.forEach((o) => {
      if (!o || !o.id) return;
      if (o.status !== "delivered") return;
      // Gating: Points awarded ONLY on Delivery orders (Pickup orders earn 0 points)
      if (o.order_type === "pickup" || (!o.delivery_address && (o.delivery_fee ?? 0) === 0)) return;

      const orderCustomerId = o.customer_id || cid;
      const isMatch =
        orderCustomerId === cid ||
        (user?.email && o.customer_email?.toLowerCase() === user.email.toLowerCase()) ||
        placedOrderIds.includes(o.id);

      if (!isMatch) return;

      const restId = o.restaurant_id || "";
      const override = findRestaurantPointsOverride(pointsOverrides, restId);
      const earned = calculateOrderEarnedPoints(pointsConfig, override, o);

      if (earned > 0) {
        void creditLoyaltyPoints(orderCustomerId, restId, earned, o.id);
      }
    });
  }, [firebaseOrders, user, placedOrderIds, pointsConfig, pointsOverrides, hydrated]);

  // Load the signed-in customer's cart from Firebase
  useEffect(() => {
    if (!hydrated || !authHydrated) return;
    if (!user) {
      setCloudReady(false);
      setSyncing(false);
      return;
    }
    const db = getDb();
    if (!db) return;
    let cancelled = false;
    setSyncing(true);
    void get(ref(db, cartPath(user.uid)))
      .then((snap) => {
        if (cancelled) return;
        const savedRaw = (snap.val() ?? null) as
          (Omit<StoredCart, "lines"> & { lines?: unknown }) | null;
        const saved = savedRaw ? { ...savedRaw, lines: normalizeLines(savedRaw.lines) } : null;
        setLines((current) => {
          if (current.length > 0) return current;
          return saved?.lines ?? [];
        });
        if (saved && (saved.lines?.length ?? 0) > 0) {
          setTip((current) => (current === 0 ? (saved.tip ?? 0) : current));
          setCouponCode((current) => current ?? saved.couponCode ?? null);
          if (saved.mode) setMode(saved.mode);
          if (saved.wantsToRedeemPoints !== undefined)
            setWantsToRedeemPoints(saved.wantsToRedeemPoints);
        }
      })
      .catch((error: unknown) => {
        console.warn("[cart] could not load saved cart", error);
      })
      .finally(() => {
        if (cancelled) return;
        setSyncing(false);
        setCloudReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, hydrated, authHydrated]);

  // Persist cart to localStorage
  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      CART_KEY,
      JSON.stringify({ lines, tip, couponCode, mode, wantsToRedeemPoints }),
    );
  }, [lines, tip, couponCode, mode, wantsToRedeemPoints, hydrated]);

  // Persist placed orders IDs to localStorage
  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(PLACED_ORDERS_KEY, JSON.stringify(placedOrderIds));
  }, [placedOrderIds, hydrated]);

  // Mirror cart to user's Firebase cart node when signed in
  useEffect(() => {
    if (!user || !cloudReady) return;
    const db = getDb();
    if (!db) return;
    const timer = window.setTimeout(() => {
      void set(ref(db, cartPath(user.uid)), {
        lines,
        tip,
        couponCode,
        mode,
        wantsToRedeemPoints,
        updatedAt: new Date().toISOString(),
      }).catch((error: unknown) => console.warn("[cart] could not save cart", error));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [user, cloudReady, lines, tip, couponCode, mode, wantsToRedeemPoints]);

  const restaurantSlug = lines[0]?.restaurantSlug ?? null;
  const restaurant = useMemo(
    () => (restaurantSlug ? getRestaurant(restaurantSlug) : undefined),
    [restaurantSlug],
  );
  const currentRestaurantName = restaurant?.name ?? (restaurantSlug || undefined);

  const hasConflict = useCallback(
    (newRestaurantSlug: string) => {
      if (!lines.length || !newRestaurantSlug) return false;
      const currentSlug = lines[0]?.restaurantSlug;
      if (!currentSlug) return false;
      return currentSlug !== newRestaurantSlug;
    },
    [lines],
  );

  const addLine = useCallback<CartState["addLine"]>(
    (input, options) => {
      const { dish, restaurantSlug: slug, sizeId, extraIds, removed, notes, qty } = input;
      const size = dish.sizes.find((s) => s.id === sizeId) ?? dish.sizes[0];
      const selectedExtras = dish.extras.filter((e) => extraIds.includes(e.id));
      const extrasPrice = selectedExtras.reduce((sum, e) => sum + e.price, 0);
      const delta = size?.delta ?? 0;
      const unitPrice = Math.round((dish.price + delta + extrasPrice) * 100) / 100;

      const variant: OrderLineVariant | null = size
        ? { id: size.id, name: size.label, price_delta: size.delta }
        : null;

      const addons: OrderLineAddon[] = selectedExtras.map((e) => ({
        id: e.id,
        name: e.label,
        price: e.price,
        quantity: 1,
      }));

      const line: CartLine = {
        lineId: `${dish.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        dishId: dish.id,
        restaurantSlug: slug,
        name: dish.name,
        image: dish.image,
        basePrice: dish.price,
        unitPrice,
        sizeLabel: size?.label ?? "Regular",
        variant,
        addons,
        extras: selectedExtras.map((e) => e.label),
        removed,
        notes,
        qty,
      };

      const isConflict = lines.length > 0 && lines[0]!.restaurantSlug !== slug;

      if (isConflict && !options?.forceReplace) {
        const currentSlug = lines[0]!.restaurantSlug;
        const currentRest = getRestaurant(currentSlug);
        const newRest = getRestaurant(slug);
        const currentSubtotal =
          Math.round(lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0) * 100) / 100;
        const currentItemCount = lines.reduce((sum, l) => sum + l.qty, 0);
        return {
          success: false,
          conflict: {
            currentRestaurantSlug: currentSlug,
            currentRestaurantName: currentRest?.name || currentSlug,
            itemCount: currentItemCount,
            subtotal: currentSubtotal,
            itemsSummary: lines.map((l) => `${l.qty}× ${l.name}`),
            newRestaurantSlug: slug,
            newRestaurantName: newRest?.name || slug,
          },
          replaced: false,
        };
      }

      if (isConflict && options?.forceReplace) {
        setCouponCode(null);
        setCouponReason(null);
        setWantsToRedeemPoints(false);
        setLines([line]);
        return { success: true, replaced: true };
      }

      setLines((prev) => {
        if (prev.length && prev[0]!.restaurantSlug !== slug) {
          return [line];
        }
        return [...prev, line];
      });
      return { success: true, replaced: false };
    },
    [lines],
  );

  const clearAndAddLine = useCallback<CartState["clearAndAddLine"]>(
    (input) => {
      return addLine(input, { forceReplace: true });
    },
    [addLine],
  );

  const setQtyFn = useCallback((lineId: string, qty: number) => {
    setLines((prev) =>
      qty <= 0
        ? prev.filter((l) => l.lineId !== lineId)
        : prev.map((l) => (l.lineId === lineId ? { ...l, qty } : l)),
    );
  }, []);

  const removeLine = useCallback((lineId: string) => {
    setLines((prev) => prev.filter((l) => l.lineId !== lineId));
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    setTip(0);
    setCouponCode(null);
    setCouponReason(null);
    setWantsToRedeemPoints(false);
  }, []);

  const rawSubtotal =
    Math.round(lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0) * 100) / 100;
  const itemCount = lines.reduce((sum, l) => sum + l.qty, 0);

  // Resolve customer coordinates from active saved location or live GPS
  const customerCoords = useMemo(() => {
    if (activeLocation && activeLocation.latitude != null && activeLocation.longitude != null) {
      return { latitude: activeLocation.latitude, longitude: activeLocation.longitude };
    }
    if (gpsCoordinates && gpsCoordinates.latitude != null && gpsCoordinates.longitude != null) {
      return { latitude: gpsCoordinates.latitude, longitude: gpsCoordinates.longitude };
    }
    return { latitude: -26.1952, longitude: 28.0345 };
  }, [activeLocation, gpsCoordinates]);

  // Live branches from Firebase RTDB (§7 of Multi-Branch Integration Contract)
  const { branches: liveBranches } = useRestaurantBranches(restaurantSlug || restaurant?.id);

  // Automatic branch selection per §14 & §15 of Multi-Branch Integration Contract
  const branchSelectionResult = useMemo<BranchSelectionResult>(() => {
    if (!restaurant) {
      return {
        ok: false,
        reason: "restaurant_unavailable",
        message: "No restaurant selected.",
      };
    }
    return selectBestBranch({
      restaurant,
      branches: liveBranches,
      destinationCoords: customerCoords,
      mode,
    });
  }, [restaurant, liveBranches, customerCoords, mode]);

  const selectedBranch = branchSelectionResult.ok ? branchSelectionResult.branch : null;
  const branchId = selectedBranch?.id || null;
  const quotedDistanceKm = branchSelectionResult.ok ? branchSelectionResult.distanceKm : null;

  // Derived delivery quote using automatic branch selection (§14 & §17)
  const quote = useMemo<DeliveryQuote>(() => {
    if (mode === "pickup") {
      return {
        mode: "pickup",
        isWithinRange: true,
        distanceKm: 0,
        fee: 0,
        maxRadiusKm: restaurant?.delivery_radius_km ?? 20,
        reason: "pickup",
      };
    }
    if (!branchSelectionResult.ok) {
      return {
        mode: "delivery",
        isWithinRange: false,
        distanceKm: 0,
        fee: 0,
        maxRadiusKm: restaurant?.delivery_radius_km ?? 20,
        reason:
          branchSelectionResult.reason === "invalid_destination"
            ? "no-customer-coords"
            : "out-of-range",
      };
    }
    return {
      mode: "delivery",
      isWithinRange: true,
      distanceKm: branchSelectionResult.distanceKm,
      fee: branchSelectionResult.deliveryFee,
      maxRadiusKm: selectedBranch?.delivery_radius_km ?? restaurant?.delivery_radius_km ?? 20,
      reason: "ok",
    };
  }, [mode, branchSelectionResult, restaurant, selectedBranch]);

  /* -------------------------------------------------------------------------- */
  /*  Checkout Promo Engine (§5 of Integration Guide)                          */
  /* -------------------------------------------------------------------------- */

  // STEP 1 — Combo Deals (always evaluated first)
  const { savings: comboSavings, totalDiscount: comboDiscount } = useMemo(() => {
    if (!restaurantSlug || lines.length === 0) return { savings: [], totalDiscount: 0 };
    const cartItems = lines.map((l) => ({
      item_id: l.dishId || l.lineId,
      name: l.name,
      quantity: l.qty,
      unit_price: l.unitPrice,
      basePrice: l.basePrice,
      line_total: l.unitPrice * l.qty,
    }));
    return evaluateCombos(cartItems, restaurantSlug, rawCombos);
  }, [lines, restaurantSlug, rawCombos]);

  const subtotalAfterCombos = Math.max(0, r2(rawSubtotal - comboDiscount));

  // Determine if this is the customer's first delivered order
  const isFirstOrder = useMemo(() => {
    if (user?.uid) {
      const userOrders = Object.values(firebaseOrders).filter(
        (o) =>
          o.customer_id === user.uid ||
          (user.email && o.customer_email?.toLowerCase() === user.email.toLowerCase()) ||
          placedOrderIds.includes(o.id),
      );
      return !userOrders.some((o) => o.status === "delivered");
    }
    const localOrders = Object.values(firebaseOrders).filter((o) => placedOrderIds.includes(o.id));
    return !localOrders.some((o) => o.status === "delivered");
  }, [firebaseOrders, user, placedOrderIds]);

  const cheapestItemUnit = useMemo(() => {
    if (lines.length === 0) return 0;
    return Math.min(...lines.map((l) => l.basePrice || l.unitPrice));
  }, [lines]);

  // STEP 2 — Coupon Codes (validate and price coupon)
  const activePromoCampaign = useMemo(() => {
    if (!couponCode) return null;
    return (
      campaigns.find((c) => c.code.toUpperCase() === couponCode.toUpperCase() && c.is_active) ||
      null
    );
  }, [campaigns, couponCode]);

  const couponResult = useMemo(() => {
    if (!activePromoCampaign) {
      return { ok: false, reason: null, discount: 0, freeDelivery: false };
    }
    return validateAndPriceCoupon(activePromoCampaign, {
      subtotalAfterCombos,
      deliveryFee: quote.fee,
      cheapestItemUnit,
      restaurantId: restaurantSlug || "",
      restaurant,
      isFirstOrder,
    });
  }, [
    activePromoCampaign,
    subtotalAfterCombos,
    quote.fee,
    cheapestItemUnit,
    restaurantSlug,
    restaurant,
    isFirstOrder,
  ]);

  const couponDiscount = couponResult.discount;
  const isFreeDeliveryCoupon = couponResult.freeDelivery;

  // STEP 3 — Resolve loyalty points configuration for this restaurant
  const effectivePointsConfig = useMemo(() => {
    const override = restaurantSlug ? pointsOverrides[restaurantSlug] : null;
    return resolveEffectivePointsConfig(pointsConfig, override);
  }, [pointsConfig, pointsOverrides, restaurantSlug]);

  // STEP 4 — Points Redemption at Checkout
  const pointsRedemption = useMemo(() => {
    if (
      !effectivePointsConfig.enabled ||
      !effectivePointsConfig.redemption_enabled ||
      !wantsToRedeemPoints ||
      customerWallet.balance < effectivePointsConfig.points_required
    ) {
      return { applied: false, pointsSpent: 0, discount: 0 };
    }
    const base = Math.max(0, subtotalAfterCombos - (isFreeDeliveryCoupon ? 0 : couponDiscount));
    if (base <= 0) return { applied: false, pointsSpent: 0, discount: 0 };
    const discount = r2(base * (effectivePointsConfig.discount_percent / 100));
    return {
      applied: true,
      pointsSpent: effectivePointsConfig.points_required,
      discount,
    };
  }, [
    effectivePointsConfig,
    wantsToRedeemPoints,
    customerWallet.balance,
    subtotalAfterCombos,
    isFreeDeliveryCoupon,
    couponDiscount,
  ]);

  const pointsDiscount = pointsRedemption.discount;

  // Estimated points earnings on delivery (§6 of Integration Guide). Points awarded only for Delivery.
  const pointsEarningsPreview = useMemo(() => {
    if (mode === "pickup") return 0;
    const override = findRestaurantPointsOverride(pointsOverrides, restaurantSlug, restaurant);
    const cartOrder = {
      order_type: "delivery" as const,
      items: lines.map((l) => ({ item_id: l.dishId || l.lineId, quantity: l.qty })),
    };
    return calculateOrderEarnedPoints(pointsConfig, override, cartOrder);
  }, [mode, pointsConfig, pointsOverrides, restaurantSlug, restaurant, lines]);

  // STEP 5 — Final Order Totals
  const totalCombinedDiscount = Math.min(
    rawSubtotal,
    r2(comboDiscount + (isFreeDeliveryCoupon ? 0 : couponDiscount) + pointsDiscount),
  );
  const effectiveDeliveryFee = mode === "pickup" || isFreeDeliveryCoupon ? 0 : quote.fee;

  const totals = useMemo<OrderTotals>(() => {
    return calculateTotals({
      items: lines,
      deliveryFee: effectiveDeliveryFee,
      tip,
      discount: totalCombinedDiscount,
      serviceFeeRate: 0.05,
    });
  }, [lines, effectiveDeliveryFee, tip, totalCombinedDiscount]);

  const applyCoupon = useCallback(
    (code: string) => {
      const key = code.trim().toUpperCase();
      if (!key) {
        setCouponReason("Please enter a promo code");
        return { ok: false, reason: "Please enter a promo code" };
      }
      const match = campaigns.find((c) => c.code.toUpperCase() === key && c.is_active);
      if (!match) {
        setCouponReason("That coupon code does not exist or is inactive");
        return { ok: false, reason: "That coupon code does not exist or is inactive" };
      }

      // Pre-flight check with current cart
      const check = validateAndPriceCoupon(match, {
        subtotalAfterCombos,
        deliveryFee: quote.fee,
        cheapestItemUnit,
        restaurantId: restaurantSlug || "",
        restaurant,
        isFirstOrder,
      });

      if (!check.ok) {
        setCouponReason(check.reason);
        return { ok: false, reason: check.reason || "Coupon criteria not met" };
      }

      setCouponCode(key);
      setCouponReason(null);
      return { ok: true };
    },
    [
      campaigns,
      subtotalAfterCombos,
      quote.fee,
      cheapestItemUnit,
      restaurantSlug,
      restaurant,
      isFirstOrder,
    ],
  );

  // Derived live ETA
  const deliveryEtaMinutes = useMemo<number>(() => {
    const prep = restaurant?.prep_time_minutes ?? restaurant?.etaMinutes[0] ?? 20;
    if (mode === "pickup" || quote.distanceKm == null) return prep;
    return Math.round(prep + Math.ceil(quote.distanceKm / 0.5));
  }, [restaurant, mode, quote.distanceKm]);

  // Can the customer proceed to checkout?
  const canCheckout = useMemo<boolean>(() => {
    if (lines.length === 0 || totals.total <= 0) return false;
    if (mode === "pickup") return true;
    return quote.isWithinRange;
  }, [lines.length, totals.total, mode, quote.isWithinRange]);

  // Active customer orders merged from live Firebase
  const orders = useMemo<FirebaseOrder[]>(() => {
    const all = Object.values(firebaseOrders);
    const placedSet = new Set(placedOrderIds);
    return all
      .filter((o) => {
        if (!o || !o.id) return false;
        if (user && o.customer_id === user.uid) return true;
        if (user && o.customer_email && o.customer_email.toLowerCase() === user.email.toLowerCase())
          return true;
        if (placedSet.has(o.id)) return true;
        return false;
      })
      .sort((a, b) =>
        (b.placed_at || b.created_at || "").localeCompare(a.placed_at || a.created_at || ""),
      );
  }, [firebaseOrders, user, placedOrderIds]);

  const placeOrder = useCallback<CartState["placeOrder"]>(
    async (input) => {
      const {
        address,
        mode: orderMode,
        paymentMethod = "card",
        specialInstructions,
        paymentProofUrl,
        paymentNotes,
        paymentGateway,
        paymentReference,
        cardBrand,
        cardLast4,
      } = input;
      const rest = restaurantSlug ? getRestaurant(restaurantSlug) : undefined;
      const customerId = user?.uid || "guest_customer";
      const deliveryAddress: DeliveryAddress =
        typeof address === "string"
          ? {
              label: orderMode === "pickup" ? "Pickup" : "Delivery",
              street: address,
              city: "Johannesburg",
              postal_code: "2000",
              latitude: customerCoords.latitude,
              longitude: customerCoords.longitude,
              notes: specialInstructions || null,
            }
          : address;

      const isDelivery = orderMode === "delivery";
      const override = findRestaurantPointsOverride(pointsOverrides, restaurantSlug, rest);
      const eff = resolveEffectivePointsConfig(pointsConfig, override);

      let orderPointsPerOrder = 0;
      let orderPointsPerItem = 0;

      if (isDelivery && eff.enabled && !eff.rewards_disabled_for_restaurant) {
        if (eff.method === "per_order" || eff.method === "both") {
          orderPointsPerOrder = Number(eff.points_per_order) || 0;
        }
        if (eff.method === "per_item" || eff.method === "both") {
          orderPointsPerItem = Number(eff.points_per_item_default) || 0;
        }
      }

      const items = lines.map((l) => ({
        item_id: l.dishId || l.lineId,
        name: l.name,
        quantity: l.qty,
        unit_price: l.basePrice || l.unitPrice,
        notes: l.notes || null,
        variant: l.variant,
        addons: l.addons,
        points_per_item: orderPointsPerItem,
        points_per_items: orderPointsPerItem,
        points_earned: orderPointsPerItem * l.qty,
      }));

      const totalItemsPoints = items.reduce((s, it) => s + (it.points_earned || 0), 0);

      const finalDeliveryFee = orderMode === "pickup" ? 0 : totals.deliveryFee;
      const etaMin = deliveryEtaMinutes;
      const etaAt = new Date(Date.now() + etaMin * 60_000).toISOString();

      // Redeem loyalty points transaction if applied (§9 of Integration Guide)
      let pointsDeducted = false;
      if (pointsRedemption.applied && pointsRedemption.pointsSpent > 0) {
        const redeemed = await redeemLoyaltyPoints(
          customerId,
          restaurantSlug || "",
          pointsRedemption.pointsSpent,
          null,
        );
        if (!redeemed) {
          throw new Error("Insufficient loyalty points balance for redemption.");
        }
        pointsDeducted = true;
      }

      let orderId = "";
      try {
        // Increment coupon usage count atomically
        if (activePromoCampaign) {
          await incrementCouponUsage(activePromoCampaign.id);
        }

        const isCard =
          paymentMethod === "card" ||
          paymentMethod === "apple_pay" ||
          paymentMethod === "wallet" ||
          paymentMethod === "google_pay";

        if (orderMode === "delivery" && !branchSelectionResult.ok) {
          throw new Error(
            branchSelectionResult.message ||
              "This restaurant cannot deliver to your selected location.",
          );
        }

        const selectedBranchSnapshot = selectedBranch
          ? {
              id: selectedBranch.id,
              name: selectedBranch.name,
              code: selectedBranch.code,
              address: selectedBranch.address,
              city: selectedBranch.city,
              phone: selectedBranch.phone,
              latitude: selectedBranch.latitude,
              longitude: selectedBranch.longitude,
              delivery_radius_km: selectedBranch.delivery_radius_km,
              distance_km: branchSelectionResult.ok ? branchSelectionResult.distanceKm : null,
            }
          : null;

        orderId = await placeFirebaseOrder({
          restaurant: {
            id: rest?.id || rest?.slug || restaurantSlug || "restaurant-main",
            name: rest?.name || "Restaurant Kitchen",
            image: rest?.image || null,
          },
          branch: selectedBranchSnapshot,
          customer: {
            uid: user?.uid ?? null,
            name: user?.name || "Customer",
            phone: user?.phone || "+27 82 555 0100",
            email: user?.email || "customer@hearth.app",
          },
          items,
          order_type: orderMode,
          delivery_address: orderMode === "pickup" ? null : deliveryAddress,
          special_instructions: specialInstructions || null,
          payment_method: paymentMethod,
          payment_status: isCard ? "paid" : "pending",
          payment_proof_url: paymentProofUrl || null,
          payment_notes: paymentNotes || null,
          payment_gateway: paymentGateway || (isCard ? "demo-gateway" : null),
          payment_reference: paymentReference || null,
          card_brand: cardBrand || (isCard ? "Visa" : null),
          card_last4: cardLast4 || (isCard ? "4242" : null),
          coupon_code: couponCode,
          discount: totals.discount,
          tip: orderMode === "pickup" ? 0 : totals.tip,
          delivery_fee: finalDeliveryFee,
          eta_minutes: etaMin,
          eta_at: etaAt,
          points_per_order: orderPointsPerOrder,
          points_per_items: totalItemsPoints,
        });
      } catch (err) {
        // If order placement fails, refund redeemed points (§9)
        if (pointsDeducted) {
          void creditLoyaltyPoints(
            customerId,
            restaurantSlug || "",
            pointsRedemption.pointsSpent,
            "refund_failed_order",
          );
        }
        throw err;
      }

      // Write promotional breakdown snapshot to Firebase order (§5 of Integration Guide)
      const promoBreakdown = {
        combos: comboSavings.map((c) => ({
          id: c.comboId,
          name: c.name,
          timesApplied: c.timesApplied,
          discount: c.discount,
        })),
        coupon: activePromoCampaign
          ? { code: activePromoCampaign.code, discount: couponDiscount }
          : null,
        points: pointsRedemption.applied
          ? { spent: pointsRedemption.pointsSpent, discount: pointsDiscount }
          : null,
      };

      try {
        await rtdbSet(`orders/${orderId}/promo_breakdown`, promoBreakdown);
      } catch (err) {
        console.warn("Could not save promo breakdown:", err);
      }

      setPlacedOrderIds((prev) => [orderId, ...prev]);
      clear();
      return orderId;
    },
    [
      lines,
      restaurantSlug,
      user,
      customerCoords,
      totals.deliveryFee,
      totals.discount,
      totals.tip,
      deliveryEtaMinutes,
      couponCode,
      activePromoCampaign,
      pointsRedemption,
      comboSavings,
      couponDiscount,
      pointsDiscount,
      clear,
    ],
  );

  const getOrder = useCallback(
    (id: string) => {
      return firebaseOrders[id] ?? orders.find((o) => o.id === id);
    },
    [firebaseOrders, orders],
  );

  const value = useMemo<CartState>(
    () => ({
      lines,
      restaurantSlug,
      restaurant,
      currentRestaurantName,
      tip,
      couponCode,
      couponReason: couponResult.reason,
      mode,
      setMode,
      hasConflict,
      addLine,
      clearAndAddLine,
      setQty: setQtyFn,
      removeLine,
      clear,
      setTip,
      applyCoupon,
      removeCoupon: () => {
        setCouponCode(null);
        setCouponReason(null);
      },
      itemCount,
      comboSavings,
      comboDiscount,
      couponDiscount,
      isFreeDeliveryCoupon,
      pointsDiscount,
      wantsToRedeemPoints,
      setWantsToRedeemPoints,
      pointsConfig,
      pointsEarningsPreview,
      customerWallet,
      selectedBranch,
      branchSelectionResult,
      branchId,
      quotedDistanceKm,
      quote,
      totals,
      subtotal: totals.subtotal,
      deliveryFee: totals.deliveryFee,
      serviceFee: totals.serviceFee,
      discount: totals.discount,
      total: totals.total,
      deliveryEtaMinutes,
      canCheckout,
      orders,
      placedOrderIds,
      placeOrder,
      getOrder,
      syncing,
      storage: user ? "cloud" : "local",
    }),
    [
      lines,
      restaurantSlug,
      restaurant,
      currentRestaurantName,
      tip,
      couponCode,
      couponResult.reason,
      mode,
      hasConflict,
      addLine,
      clearAndAddLine,
      setQtyFn,
      removeLine,
      clear,
      applyCoupon,
      itemCount,
      comboSavings,
      comboDiscount,
      couponDiscount,
      isFreeDeliveryCoupon,
      pointsDiscount,
      wantsToRedeemPoints,
      pointsConfig,
      pointsEarningsPreview,
      customerWallet,
      selectedBranch,
      branchSelectionResult,
      branchId,
      quotedDistanceKm,
      quote,
      totals,
      deliveryEtaMinutes,
      canCheckout,
      orders,
      placedOrderIds,
      placeOrder,
      getOrder,
      syncing,
      user,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}

export const stageOrder: OrderStage[] = [
  "placed",
  "pending",
  "accepted",
  "preparing",
  "ready",
  "assigned",
  "picked_up",
  "on_the_way",
  "delivered",
];

export const stageCopy: Record<OrderStage, { title: string; detail: string }> = {
  placed: { title: "Order placed", detail: "Sent to the kitchen" },
  pending: { title: "Order pending", detail: "Awaiting restaurant acceptance" },
  accepted: { title: "Restaurant accepted", detail: "Kitchen confirmed your order" },
  preparing: { title: "Preparing food", detail: "Cooking to order" },
  ready: { title: "Ready for pickup", detail: "Packed, sealed and ready" },
  assigned: { title: "Driver assigned", detail: "Driver heading to the restaurant" },
  picked_up: { title: "Driver picked up", detail: "Food collected from kitchen" },
  on_the_way: { title: "On the way", detail: "Driver is en route to you" },
  delivered: { title: "Delivered", detail: "Enjoy your meal!" },
  cancelled: { title: "Order cancelled", detail: "This order was cancelled" },
  refunded: { title: "Order refunded", detail: "Refund has been processed" },
};

/** Derives stage from order status */
export function currentStage(order: FirebaseOrder | undefined | null): OrderStage {
  if (!order) return "placed";
  const st = (order.status || "pending").toLowerCase() as OrderStage;
  if (st === "cancelled" || st === "refunded") return st;
  if (stageOrder.includes(st)) return st;
  return "pending";
}
