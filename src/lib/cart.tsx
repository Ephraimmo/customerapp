import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { coupons, getRestaurant, type Dish } from "./data";
import { useAuth } from "./auth";
import { get, getDb, ref, set } from "./firebase";

export type CartLine = {
  lineId: string;
  dishId: string;
  restaurantSlug: string;
  name: string;
  image: string;
  unitPrice: number;
  sizeLabel: string;
  extras: string[];
  removed: string[];
  notes: string;
  qty: number;
};

export type OrderStage =
  | "placed"
  | "accepted"
  | "preparing"
  | "ready"
  | "driver_assigned"
  | "en_route"
  | "delivered";

export type Order = {
  id: string;
  restaurantSlug: string;
  restaurantName: string;
  lines: CartLine[];
  total: number;
  placedAt: number;
  etaAt: number;
  address: string;
  mode: "delivery" | "pickup";
  driver: { name: string; vehicle: string; rating: number };
};

type CartState = {
  lines: CartLine[];
  restaurantSlug: string | null;
  tip: number;
  couponCode: string | null;
  addLine: (input: {
    dish: Dish;
    restaurantSlug: string;
    sizeId: string;
    extraIds: string[];
    removed: string[];
    notes: string;
    qty: number;
  }) => { replaced: boolean };
  setQty: (lineId: string, qty: number) => void;
  removeLine: (lineId: string) => void;
  clear: () => void;
  setTip: (tip: number) => void;
  applyCoupon: (code: string) => boolean;
  removeCoupon: () => void;
  itemCount: number;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  discount: number;
  total: number;
  orders: Order[];
  placeOrder: (input: { address: string; mode: "delivery" | "pickup" }) => Order;
  getOrder: (id: string) => Order | undefined;
  /** True while the signed-in customer's saved cart is being loaded from the cloud. */
  syncing: boolean;
  /** "cloud" once the cart is saved to the customer's account, else "local". */
  storage: "cloud" | "local";
};

const CartContext = createContext<CartState | null>(null);

const CART_KEY = "hearth.cart.v1";
const ORDERS_KEY = "hearth.orders.v1";

type StoredCart = { lines: CartLine[]; tip: number; couponCode: string | null };

function cartPath(uid: string) {
  return `customerCarts/${uid}`;
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
  const [lines, setLines] = useState<CartLine[]>([]);
  const [tip, setTip] = useState(0);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [syncing, setSyncing] = useState(false);
  /** Guards cloud writes until the signed-in cart has been read back. */
  const [cloudReady, setCloudReady] = useState(false);

  useEffect(() => {
    const cart = read<{ lines: CartLine[]; tip: number; couponCode: string | null }>(CART_KEY, {
      lines: [],
      tip: 0,
      couponCode: null,
    });
    setLines(cart.lines ?? []);
    setTip(cart.tip ?? 0);
    setCouponCode(cart.couponCode ?? null);
    setOrders(read<Order[]>(ORDERS_KEY, []));
    setHydrated(true);
  }, []);

  /* Load the signed-in customer's cart from Firebase, merging any guest cart. */
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
        const saved = (snap.val() ?? null) as StoredCart | null;
        setLines((current) => {
          // A cart built while signed out wins, so nothing the customer just
          // added is lost when they sign in.
          if (current.length > 0) return current;
          return saved?.lines ?? [];
        });
        if (saved && (saved.lines?.length ?? 0) > 0) {
          setTip((current) => (current === 0 ? (saved.tip ?? 0) : current));
          setCouponCode((current) => current ?? saved.couponCode ?? null);
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

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(CART_KEY, JSON.stringify({ lines, tip, couponCode }));
  }, [lines, tip, couponCode, hydrated]);

  /* Mirror every change to the customer's account so it survives sign-out. */
  useEffect(() => {
    if (!user || !cloudReady) return;
    const db = getDb();
    if (!db) return;
    const timer = window.setTimeout(() => {
      void set(ref(db, cartPath(user.uid)), {
        lines,
        tip,
        couponCode,
        updatedAt: new Date().toISOString(),
      }).catch((error: unknown) => console.warn("[cart] could not save cart", error));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [user, cloudReady, lines, tip, couponCode]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  }, [orders, hydrated]);

  const restaurantSlug = lines[0]?.restaurantSlug ?? null;

  const addLine = useCallback<CartState["addLine"]>(
    ({ dish, restaurantSlug: slug, sizeId, extraIds, removed, notes, qty }) => {
      const size = dish.sizes.find((s) => s.id === sizeId) ?? dish.sizes[0];
      const extras = dish.extras.filter((e) => extraIds.includes(e.id));
      const unitPrice =
        dish.price + (size?.delta ?? 0) + extras.reduce((sum, e) => sum + e.price, 0);

      const line: CartLine = {
        lineId: `${dish.id}-${Date.now()}`,
        dishId: dish.id,
        restaurantSlug: slug,
        name: dish.name,
        image: dish.image,
        unitPrice,
        sizeLabel: size?.label ?? "Regular",
        extras: extras.map((e) => e.label),
        removed,
        notes,
        qty,
      };

      let replaced = false;
      setLines((prev) => {
        if (prev.length && prev[0]!.restaurantSlug !== slug) {
          replaced = true;
          return [line];
        }
        return [...prev, line];
      });
      return { replaced };
    },
    [],
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
  }, []);

  const applyCoupon = useCallback((code: string) => {
    const key = code.trim().toUpperCase();
    if (!coupons[key]) return false;
    setCouponCode(key);
    return true;
  }, []);

  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
  const itemCount = lines.reduce((sum, l) => sum + l.qty, 0);
  const restaurant = restaurantSlug ? getRestaurant(restaurantSlug) : undefined;
  const baseDelivery = restaurant?.deliveryFee ?? 0;
  const coupon = couponCode ? coupons[couponCode] : undefined;
  const deliveryFee = coupon?.type === "delivery" ? 0 : baseDelivery;
  const serviceFee = subtotal > 0 ? Math.round(subtotal * 0.05 * 100) / 100 : 0;
  const discount =
    coupon?.type === "percent"
      ? Math.min(10, Math.round(subtotal * (coupon.value / 100) * 100) / 100)
      : coupon?.type === "fixed"
        ? Math.min(coupon.value, subtotal)
        : 0;
  const total = Math.max(0, subtotal + deliveryFee + serviceFee + tip - discount);

  const placeOrder = useCallback<CartState["placeOrder"]>(
    ({ address, mode }) => {
      const rest = restaurantSlug ? getRestaurant(restaurantSlug) : undefined;
      const eta = (rest?.etaMinutes[1] ?? 30) * 60_000;
      const order: Order = {
        id: `HRT-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        restaurantSlug: restaurantSlug ?? "",
        restaurantName: rest?.name ?? "Restaurant",
        lines,
        total,
        placedAt: Date.now(),
        etaAt: Date.now() + eta,
        address,
        mode,
        driver: { name: "Nadia K.", vehicle: "Electric scooter • KX21 ORD", rating: 4.9 },
      };
      setOrders((prev) => [order, ...prev]);
      clear();
      return order;
    },
    [restaurantSlug, lines, total, clear],
  );

  const getOrder = useCallback((id: string) => orders.find((o) => o.id === id), [orders]);

  const value = useMemo<CartState>(
    () => ({
      lines,
      restaurantSlug,
      tip,
      couponCode,
      addLine,
      setQty: setQtyFn,
      removeLine,
      clear,
      setTip,
      applyCoupon,
      removeCoupon: () => setCouponCode(null),
      itemCount,
      subtotal,
      deliveryFee,
      serviceFee,
      discount,
      total,
      orders,
      placeOrder,
      getOrder,
      syncing,
      storage: user ? "cloud" : "local",
    }),
    [
      lines,
      restaurantSlug,
      tip,
      couponCode,
      addLine,
      setQtyFn,
      removeLine,
      clear,
      applyCoupon,
      itemCount,
      subtotal,
      deliveryFee,
      serviceFee,
      discount,
      total,
      orders,
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
  "accepted",
  "preparing",
  "ready",
  "driver_assigned",
  "en_route",
  "delivered",
];

export const stageCopy: Record<OrderStage, { title: string; detail: string }> = {
  placed: { title: "Order placed", detail: "Sent to the kitchen" },
  accepted: { title: "Restaurant accepted", detail: "Your order is confirmed" },
  preparing: { title: "Preparing your food", detail: "Cooking to order" },
  ready: { title: "Ready for pickup", detail: "Packed and sealed" },
  driver_assigned: { title: "Driver assigned", detail: "Heading to the restaurant" },
  en_route: { title: "On the way", detail: "Your driver is en route" },
  delivered: { title: "Delivered", detail: "Enjoy your meal" },
};

/** Derives the live stage from elapsed time so tracking feels realtime without a backend. */
export function currentStage(order: Order, now: number): OrderStage {
  const span = order.etaAt - order.placedAt;
  const progress = Math.min(1, (now - order.placedAt) / span);
  const index = Math.min(stageOrder.length - 1, Math.floor(progress * stageOrder.length));
  return stageOrder[index] ?? "placed";
}
