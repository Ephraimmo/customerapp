import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Briefcase,
  Building,
  Check,
  ChevronRight,
  Compass,
  Crosshair,
  Gift,
  Headphones,
  Heart,
  Home,
  LogIn,
  LogOut,
  MapPin,
  MessageCircle,
  MessageSquare,
  Plus,
  Sparkles,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { BottomNav } from "@/components/app/bottom-nav";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/data";
import {
  useLoyaltyLedger,
  useLoyaltyWallet,
  usePointsConfig,
  usePromoCampaigns,
  useRestaurants,
  useRestaurantPointsOverrides,
} from "@/lib/firebase-adapters";
import {
  calculateOrderEarnedPoints,
  creditLoyaltyPoints,
  findRestaurantPointsOverride,
} from "@/lib/promotions";
import { SOUTH_AFRICAN_PRESETS, useLocation, type CityPreset } from "@/lib/location";
import { useCustomerSupportTickets } from "@/lib/support";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Your account & Rewards — Hearth" },
      {
        name: "description",
        content: "Manage addresses, loyalty points wallet, promotions and order history.",
      },
      { property: "og:title", content: "Your account & Rewards — Hearth" },
      {
        property: "og:description",
        content: "Points, rewards wallet, saved locations and favorites in one place.",
      },
    ],
  }),
  component: AccountPage,
});

const LABEL_SUGGESTIONS = [
  { label: "Home", icon: Home },
  { label: "Work", icon: Briefcase },
  { label: "Apartment", icon: Building },
  { label: "Other", icon: Sparkles },
];

function AccountPage() {
  const { restaurants } = useRestaurants();
  const { orders } = useCart();
  const { user, signOut } = useAuth();
  const customerId = user?.uid || "guest_customer";
  const customerWallet = useLoyaltyWallet(customerId);
  const pointsConfig = usePointsConfig();
  const pointsOverrides = useRestaurantPointsOverrides();
  const campaigns = usePromoCampaigns();
  const ledger = useLoyaltyLedger(customerId);
  const { tickets: supportTickets, totalUnreadCount: supportUnreadCount } =
    useCustomerSupportTickets(customerId, user?.email);

  const {
    locations,
    activeLocation,
    detectGpsLocation,
    gpsError,
    selectLocation,
    setDefaultLocation,
    saveLocationToFirebase,
    deleteLocationFromFirebase,
  } = useLocation();

  const [showAddModal, setShowAddModal] = useState(false);
  const [label, setLabel] = useState("Home");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("Johannesburg");
  const [postalCode, setPostalCode] = useState("2000");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [notes, setNotes] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [detectingGps, setDetectingGps] = useState(false);
  const [saving, setSaving] = useState(false);

  // Real-time filter: all orders under this customer profile
  const userOrders = useMemo(() => {
    return orders.filter(
      (o) =>
        o &&
        (o.customer_id === customerId ||
          (user?.email && o.customer_email?.toLowerCase() === user.email.toLowerCase())),
    );
  }, [orders, customerId, user]);

  // Real-time filter: delivered delivery orders only
  const deliveredDeliveryOrders = useMemo(() => {
    return userOrders.filter(
      (o) =>
        o.status === "delivered" &&
        o.order_type !== "pickup" &&
        Boolean(o.delivery_address || (o.delivery_fee && o.delivery_fee > 0)),
    );
  }, [userOrders]);

  // Real-time active points balance directly from live Firebase wallet
  const activeBalance = Number(customerWallet.balance) || 0;

  // Real-time points used / redeemed
  const pointsUsed = useMemo(() => {
    const fromWallet = Number(customerWallet.lifetime_redeemed) || 0;
    const fromLedger = ledger
      .filter((e) => e && (e.delta < 0 || e.reason === "redeem_discount"))
      .reduce((sum, e) => sum + Math.abs(Number(e.delta) || 0), 0);
    const fromOrders = userOrders.reduce((sum, o) => {
      const p = ((o as unknown) as Record<string, unknown>)["promo_breakdown"] as
        | { points?: { spent?: number } }
        | undefined;
      return sum + (Number(p?.points?.spent) || 0);
    }, 0);
    return Math.max(fromWallet, fromLedger, fromOrders);
  }, [customerWallet.lifetime_redeemed, ledger, userOrders]);

  const spent = userOrders.reduce((sum, o) => sum + (Number(o?.total) || 0), 0);
  const pointsRequired = Number(pointsConfig.points_required) || 100;
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round((activeBalance / pointsRequired) * 100)),
  );

  async function handleLiveGps() {
    setDetectingGps(true);
    try {
      const coords = await detectGpsLocation();
      if (coords) {
        const lat = coords.latitude;
        const lng = coords.longitude;
        setLatitude(lat.toString());
        setLongitude(lng.toString());
      }
    } finally {
      setDetectingGps(false);
    }
  }

  function applyPreset(preset: CityPreset) {
    setStreet(preset.street);
    setCity(preset.city);
    setPostalCode(preset.postal_code);
    setLatitude(preset.latitude.toString());
    setLongitude(preset.longitude.toString());
    toast.info(`Preset applied: ${preset.name}`);
  }

  async function handleAddLocationSubmit(e: React.FormEvent) {
    e.preventDefault();
    const lat = Number.parseFloat(latitude);
    const lng = Number.parseFloat(longitude);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      toast.error("Please enter valid numerical coordinates for Latitude and Longitude.");
      return;
    }

    setSaving(true);
    try {
      const id = await saveLocationToFirebase({
        label: label.trim() || "Saved Address",
        street: street.trim() || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        city: city.trim() || "Johannesburg",
        postal_code: postalCode.trim() || "2000",
        latitude: lat,
        longitude: lng,
        notes: notes.trim() || null,
        is_default: isDefault,
        source: "saved",
      });

      if (isDefault) {
        await setDefaultLocation(id);
      }

      setShowAddModal(false);
      setLabel("Home");
      setStreet("");
      setNotes("");
      setIsDefault(false);
    } catch {
      toast.error("Failed to save location to Firebase.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-full bg-background px-0 sm:max-w-[640px] md:max-w-2xl">
      <header className="border-b border-border px-4 pt-6 pb-6">
        <div className="flex items-center gap-4">
          <span className="grid size-16 place-items-center rounded-3xl bg-secondary text-lg font-black ring-1 ring-border">
            {user ? user.initials : "GU"}
          </span>
          <div>
            <h1 className="text-xl leading-tight font-black tracking-tight">
              {user ? user.name : "Guest Customer"}
            </h1>
            <p className="label-mono mt-1 text-muted-foreground">
              {user ? user.email : "Sign in to save Firebase loyalty points"}
            </p>
          </div>
        </div>
        {user ? (
          <button
            type="button"
            onClick={() => {
              signOut();
              toast("Signed out", { description: "Your cart and orders remain safely saved." });
            }}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-secondary text-sm font-black tracking-[0.1em] uppercase ring-1 ring-border hover:bg-secondary/80 cursor-pointer transition-colors"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        ) : (
          <Link
            to="/login"
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-black tracking-[0.1em] text-primary-foreground uppercase hover:bg-primary/90 transition-colors"
          >
            <LogIn className="size-4" aria-hidden />
            Sign in
          </Link>
        )}
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Orders" value={String(userOrders.length)} />
          <Stat label="Spent" value={money(spent)} />
          <Stat label="Loyalty Points" value={`${activeBalance} pts`} />
          <Stat label="Points Used" value={`${pointsUsed} pts`} />
        </div>
      </header>

      <main className="space-y-8 px-4 pt-6 pb-44 md:pb-24">
        {/* Rewards & Loyalty Wallet Screen (§8 & §9 of Integration Guide) */}
        <section className="rounded-3xl bg-foreground p-6 text-background shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="label-mono opacity-70 flex items-center gap-1.5">
              <Gift className="size-4" />
              Points & Rewards Wallet
            </span>
            <span className="rounded-full bg-background/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider">
              {pointsConfig.discount_percent}% Off per {pointsRequired} pts
            </span>
          </div>

          <div className="flex items-end justify-between">
            <div>
              <p className="font-mono text-3xl font-black">{activeBalance} pts</p>
              <p className="mt-1 text-xs opacity-75">Earn points</p>
            </div>
            <div className="text-right">
              <span className="font-mono text-base font-bold text-amber-400">{pointsUsed} pts</span>
              <p className="text-[10px] opacity-60 uppercase tracking-wider font-bold">
                Points Used
              </p>
            </div>
          </div>

          {/* Progress bar toward redemption */}
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between text-[11px] font-mono opacity-80">
              <span>Redemption Progress</span>
              <span>
                {activeBalance} / {pointsRequired} pts
              </span>
            </div>
            <div className="h-2.5 w-full bg-background/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-700 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </section>

        {/* Live Loyalty Activity Ledger (§9 of Integration Guide) */}
        <section className="space-y-3">
          <h2 className="label-mono text-muted-foreground">Recent Points History</h2>
          <div className="rounded-3xl bg-secondary p-4 ring-1 ring-border divide-y divide-border/60">
            {ledger.length > 0 ? (
              ledger.slice(0, 5).map((entry) => (
                <div
                  key={entry.id}
                  className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`grid size-7 place-items-center rounded-lg ${
                        entry.delta > 0
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-primary/10 text-primary"
                      }`}
                    >
                      {entry.delta > 0 ? (
                        <ArrowDownRight className="size-3.5" />
                      ) : (
                        <ArrowUpRight className="size-3.5" />
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-foreground capitalize">
                        {entry.reason === "earn_order"
                          ? "Order Delivery Bonus"
                          : "Points Discount Redeemed"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(entry.created_at).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        • Balance: {entry.balance_after} pts
                      </p>
                    </div>
                  </div>
                  <span
                    className={`font-mono font-bold ${entry.delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}
                  >
                    {entry.delta > 0 ? `+${entry.delta}` : entry.delta} pts
                  </span>
                </div>
              ))
            ) : (
              <div className="py-3 text-center text-xs text-muted-foreground">
                No points activity yet. Place your first order to start earning points!
              </div>
            )}
          </div>
        </section>

        {/* Customer Support & Live Help Desk (§5.4 of Support Integration Guide) */}
        <section className="rounded-3xl bg-secondary/80 p-5 border border-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary shrink-0 ring-1 ring-primary/20">
                <Headphones className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black text-foreground">Customer Support Desk</h2>
                  {supportUnreadCount > 0 ? (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary-foreground animate-pulse">
                      {supportUnreadCount} Unread
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Live chat with ForkFleet agents for delivery assistance & inquiries
                </p>
              </div>
            </div>

            <Link
              to="/support"
              className="inline-flex h-9 items-center justify-center rounded-xl bg-primary px-4 text-xs font-black uppercase tracking-wider text-primary-foreground shadow-md hover:bg-primary/90 transition-all cursor-pointer whitespace-nowrap"
            >
              Open Help
            </Link>
          </div>

          {supportTickets.length > 0 ? (
            <div className="pt-2 border-t border-border/60 space-y-1.5">
              <span className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                Recent Inquiries ({supportTickets.length})
              </span>
              <div className="divide-y divide-border/50">
                {supportTickets.slice(0, 3).map((t) => (
                  <Link
                    key={t.id}
                    to="/support"
                    search={{ ticketId: t.id }}
                    className="py-2 flex items-center justify-between text-xs hover:text-primary transition-colors cursor-pointer group"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                            t.status === "resolved"
                              ? "bg-emerald-500/15 text-emerald-600"
                              : t.status === "in_progress"
                                ? "bg-blue-500/15 text-blue-600"
                                : "bg-amber-500/15 text-amber-600"
                          }`}
                        >
                          {t.status.replace(/_/g, " ")}
                        </span>
                        <p className="font-bold truncate text-foreground group-hover:text-primary">
                          {t.subject}
                        </p>
                      </div>
                      {t.last_message ? (
                        <p className="text-[11px] text-muted-foreground truncate pl-0.5 mt-0.5">
                          {t.last_message}
                        </p>
                      ) : null}
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground group-hover:text-primary shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
              <span>Have an issue with your food or driver?</span>
              <Link
                to="/support"
                className="text-xs font-bold text-primary hover:underline cursor-pointer"
              >
                Ask a question →
              </Link>
            </div>
          )}
        </section>

        {/* Saved Locations Manager */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="label-mono text-muted-foreground">
                Saved Delivery Locations ({locations.length})
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Stored in Firebase Realtime Database & dispatched to courier live map
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setLabel("Home");
                setStreet("");
                setNotes("");
                setShowAddModal(true);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all cursor-pointer"
            >
              <Plus className="size-3.5" />
              Add Location
            </button>
          </div>

          <div className="space-y-2.5">
            {locations.map((loc) => {
              const isActive = activeLocation?.id === loc.id;
              return (
                <div
                  key={loc.id}
                  className={`flex items-start justify-between rounded-2xl p-4 border transition-all ${
                    isActive
                      ? "bg-primary/10 border-primary/40 shadow-sm"
                      : "bg-secondary/40 border-border hover:bg-secondary hover:border-border/80"
                  }`}
                >
                  <div
                    onClick={() => {
                      selectLocation(loc);
                      toast.success(`Active delivery location: ${loc.label}`);
                    }}
                    className="flex flex-1 items-start gap-3.5 text-left cursor-pointer"
                  >
                    <div
                      className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl text-xs font-bold transition-colors ${
                        isActive
                          ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                          : "bg-background text-muted-foreground border border-border"
                      }`}
                    >
                      <MapPin className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground">{loc.label}</span>
                        {loc.is_default ? (
                          <span className="rounded-md bg-primary/20 px-2 py-0.5 text-[9px] font-black uppercase text-primary tracking-wider">
                            Default
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-foreground/80 font-medium">
                        {loc.street}, {loc.city} {loc.postal_code}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] text-primary/90 font-semibold bg-primary/5 rounded-md px-2 py-0.5 w-fit border border-primary/15">
                        <Compass className="size-3 shrink-0" />
                        <span>
                          {loc.latitude?.toFixed(4)}°, {loc.longitude?.toFixed(4)}°
                        </span>
                      </div>
                      {loc.notes ? (
                        <p className="mt-1.5 text-[11px] italic text-muted-foreground">
                          "{loc.notes}"
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 ml-2 shrink-0">
                    {!loc.is_default ? (
                      <button
                        type="button"
                        onClick={() => setDefaultLocation(loc.id)}
                        className="rounded-lg bg-background px-2.5 py-1 text-[10px] font-bold text-muted-foreground hover:text-foreground border border-border cursor-pointer transition-colors"
                      >
                        Set Default
                      </button>
                    ) : null}

                    {locations.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => deleteLocationFromFirebase(loc.id)}
                        aria-label={`Delete ${loc.label}`}
                        className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Single Unified Add Location Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4">
            <button
              type="button"
              aria-label="Close modal"
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-foreground/50 backdrop-blur-md transition-opacity"
            />
            <div className="relative z-10 flex flex-col w-full max-w-lg max-h-[90vh] overflow-hidden rounded-[28px] bg-card border border-border/80 shadow-2xl animate-[var(--animate-sheet-up)]">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-border/80 bg-secondary/40 px-5 sm:px-6 py-4 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 sm:size-11 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/25">
                    <MapPin className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black tracking-tight text-foreground">
                      Add Delivery Address
                    </h3>
                    <p className="text-[11px] sm:text-xs text-muted-foreground">
                      All manual details • Use current location to auto-populate coordinates
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="grid size-9 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 border border-border cursor-pointer transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Form */}
              <form
                onSubmit={handleAddLocationSubmit}
                className="flex flex-col flex-1 min-h-0 overflow-hidden"
              >
                <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 overscroll-contain">
                  {/* Quick Label Pills */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Location Nickname (Manual)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {LABEL_SUGGESTIONS.map((item) => {
                        const Icon = item.icon;
                        const isSelected = label === item.label;
                        return (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => setLabel(item.label)}
                            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer border ${
                              isSelected
                                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                : "bg-secondary/60 text-foreground border-border hover:bg-secondary"
                            }`}
                          >
                            <Icon className="size-3.5" />
                            {item.label}
                          </button>
                        );
                      })}
                      <input
                        type="text"
                        placeholder="Or custom label..."
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        required
                        className="flex-1 min-w-[130px] h-9 rounded-xl bg-secondary/80 px-3 text-xs border border-border outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                  </div>

                  {/* Street Address */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Street Address (Manual)
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="e.g. 242 High Street, Sandton"
                        value={street}
                        onChange={(e) => setStreet(e.target.value)}
                        required
                        className="h-11 w-full rounded-xl bg-secondary/70 pl-10 pr-3.5 text-xs border border-border outline-none focus:ring-2 focus:ring-primary/30 font-medium"
                      />
                    </div>
                  </div>

                  {/* City and Postal Code */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                        City (Manual)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Johannesburg"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        required
                        className="h-11 w-full rounded-xl bg-secondary/70 px-3.5 text-xs border border-border outline-none focus:ring-2 focus:ring-primary/30 font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                        Postal Code (Manual)
                      </label>
                      <input
                        type="text"
                        placeholder="2000"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        className="h-11 w-full rounded-xl bg-secondary/70 px-3.5 text-xs border border-border outline-none focus:ring-2 focus:ring-primary/30 font-medium"
                      />
                    </div>
                  </div>

                  {/* Current location button and editable coordinates */}
                  <div className="rounded-2xl bg-secondary/50 p-4 border border-border space-y-3">
                    {gpsError ? (
                      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                        <p className="font-bold">Location permission required</p>
                        <p className="mt-1">{gpsError}</p>
                        <p className="mt-2 text-foreground/80">
                          Open the lock/site-settings icon next to the website address, allow Location,
                          reload the page, then try again.
                        </p>
                        <button type="button" onClick={handleLiveGps} className="mt-2 font-bold underline">
                          Try again
                        </button>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="block text-xs font-black text-foreground">
                          Geographic GPS Coordinates
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Use your device location or edit numbers directly
                        </span>
                      </div>

                      {/* One-time device location request */}
                      <button
                        type="button"
                        onClick={handleLiveGps}
                        disabled={detectingGps}
                        className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-black tracking-wider uppercase text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 active:scale-95 transition-all cursor-pointer disabled:opacity-60"
                      >
                        <Crosshair className={`size-3.5 ${detectingGps ? "animate-spin" : ""}`} />
                        {detectingGps ? "Getting your location…" : "Current location"}
                      </button>
                    </div>

                    {/* Editable Latitude & Longitude Inputs */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-muted-foreground mb-1 font-mono">
                          Latitude (Editable)
                        </label>
                        <input
                          type="number"
                          step="any"
                          placeholder="Current latitude"
                          value={latitude}
                          onChange={(e) => setLatitude(e.target.value)}
                          required
                          className="h-10 w-full rounded-xl bg-background px-3 font-mono text-xs border border-border outline-none focus:ring-2 focus:ring-primary/30 font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-muted-foreground mb-1 font-mono">
                          Longitude (Editable)
                        </label>
                        <input
                          type="number"
                          step="any"
                          placeholder="Current longitude"
                          value={longitude}
                          onChange={(e) => setLongitude(e.target.value)}
                          required
                          className="h-10 w-full rounded-xl bg-background px-3 font-mono text-xs border border-border outline-none focus:ring-2 focus:ring-primary/30 font-bold"
                        />
                      </div>
                    </div>

                    {/* Quick South African Presets */}
                    <div>
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                        Quick South African Presets:
                      </span>
                      <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
                        {SOUTH_AFRICAN_PRESETS.map((p) => (
                          <button
                            key={p.name}
                            type="button"
                            onClick={() => applyPreset(p)}
                            className="flex-shrink-0 rounded-lg bg-background px-2.5 py-1 text-[10px] font-bold border border-border hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors cursor-pointer"
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Delivery Notes */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Delivery Notes / Gate Code{" "}
                      <span className="opacity-70 font-normal lowercase">(optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Gate access code #4421, leave at reception"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="h-11 w-full rounded-xl bg-secondary/70 px-3.5 text-xs border border-border outline-none focus:ring-2 focus:ring-primary/30 font-medium"
                    />
                  </div>

                  {/* Default Checkbox */}
                  <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={isDefault}
                      onChange={(e) => setIsDefault(e.target.checked)}
                      className="size-4 rounded accent-primary cursor-pointer"
                    />
                    Set as default delivery address
                  </label>
                </div>

                {/* Sticky Action Footer */}
                <div className="flex gap-2.5 border-t border-border bg-card p-4 sm:p-5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="h-12 flex-1 rounded-2xl bg-secondary text-xs font-bold text-foreground border border-border hover:bg-secondary/80 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="h-12 flex-1 rounded-2xl bg-primary text-xs font-black tracking-wider uppercase text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60"
                  >
                    {saving ? "Saving to Firebase…" : "Save Location"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Active Promotional Campaigns list */}
        {campaigns.length > 0 ? (
          <section className="space-y-3">
            <h2 className="label-mono text-muted-foreground">Active Promo Codes</h2>
            <div className="grid gap-2">
              {campaigns.map((promo) => (
                <div
                  key={promo.id}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-secondary/70 border border-border text-xs"
                >
                  <div>
                    <span className="font-mono font-bold text-primary text-sm">{promo.code}</span>
                    <p className="text-muted-foreground text-[11px] mt-0.5">
                      {promo.name} • {promo.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(promo.code);
                      toast.success(`Copied coupon ${promo.code}!`);
                    }}
                    className="rounded-lg bg-background px-3 py-1.5 font-bold text-[10px] uppercase tracking-wider border border-border hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
                  >
                    Copy
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Favorite Restaurants */}
        <section>
          <h2 className="label-mono mb-3 text-muted-foreground">Favourite restaurants</h2>
          <div className="space-y-2">
            {restaurants.slice(0, 3).map((r) => (
              <Link
                key={r.slug}
                to="/restaurant/$slug"
                params={{ slug: r.slug }}
                className="flex items-center gap-3 rounded-2xl bg-secondary p-3 ring-1 ring-border hover:bg-secondary/80 transition-colors"
              >
                <img
                  src={r.image}
                  alt={r.name}
                  width={1024}
                  height={640}
                  loading="lazy"
                  className="size-12 rounded-xl object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{r.name}</span>
                  <span className="label-mono block text-muted-foreground">{r.tagline}</span>
                </span>
                <Heart className="size-4 fill-primary text-primary" aria-hidden />
              </Link>
            ))}
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-secondary p-3 ring-1 ring-border">
      <p className="font-mono text-sm font-black">{value}</p>
      <p className="label-mono text-muted-foreground">{label}</p>
    </div>
  );
}
