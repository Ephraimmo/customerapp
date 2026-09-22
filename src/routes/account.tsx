import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Briefcase,
  Building,
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
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { BottomNav } from "@/components/app/bottom-nav";
import { CartBar } from "@/components/app/cart-bar";
import {
  Callout,
  PageShell,
  Panel,
  SectionLabel,
  StatCell,
  fieldClass,
} from "@/components/app/checkout-ui";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/data";
import {
  useLoyaltyLedger,
  useLoyaltyWallet,
  usePointsConfig,
  usePromoCampaigns,
  useRestaurants,
} from "@/lib/firebase-adapters";
import { SOUTH_AFRICAN_PRESETS, useLocation, type CityPreset } from "@/lib/location";
import { useCustomerSupportTickets } from "@/lib/support";
import { cn } from "@/lib/utils";

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

const TICKET_TONES: Record<string, string> = {
  resolved: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  in_progress: "border-primary/25 bg-primary/10 text-primary",
};

function AccountPage() {
  const { restaurants } = useRestaurants();
  const { orders } = useCart();
  const { user, signOut } = useAuth();
  const customerId = user?.uid || "guest_customer";
  const customerWallet = useLoyaltyWallet(customerId);
  const pointsConfig = usePointsConfig();
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

  // Escape and a scroll lock while the address sheet is open
  useEffect(() => {
    if (!showAddModal) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setShowAddModal(false);
    }

    const previousOverflow = document.body.style.overflow;
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [showAddModal]);

  // Real-time filter: all orders under this customer profile
  const userOrders = useMemo(() => {
    return orders.filter(
      (o) =>
        o &&
        (o.customer_id === customerId ||
          (user?.email && o.customer_email?.toLowerCase() === user.email.toLowerCase())),
    );
  }, [orders, customerId, user]);

  // Real-time active points balance directly from the live wallet
  const activeBalance = Number(customerWallet.balance) || 0;

  // Real-time points used / redeemed
  const pointsUsed = useMemo(() => {
    const fromWallet = Number(customerWallet.lifetime_redeemed) || 0;
    const fromLedger = ledger
      .filter((e) => e && (e.delta < 0 || e.reason === "redeem_discount"))
      .reduce((sum, e) => sum + Math.abs(Number(e.delta) || 0), 0);
    const fromOrders = userOrders.reduce((sum, o) => {
      const p = (o as unknown as Record<string, unknown>)["promo_breakdown"] as
        { points?: { spent?: number } } | undefined;
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
  const pointsToGo = Math.max(0, pointsRequired - activeBalance);

  async function handleLiveGps() {
    setDetectingGps(true);
    try {
      const coords = await detectGpsLocation();
      if (coords) {
        setLatitude(coords.latitude.toString());
        setLongitude(coords.longitude.toString());
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
    toast.info(`Filled in ${preset.name}`);
  }

  async function handleAddLocationSubmit(e: React.FormEvent) {
    e.preventDefault();
    const lat = Number.parseFloat(latitude);
    const lng = Number.parseFloat(longitude);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      toast.error("Enter valid numbers for latitude and longitude.");
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

      toast.success(`Saved ${label.trim() || "your address"}`);
      setShowAddModal(false);
      setLabel("Home");
      setStreet("");
      setNotes("");
      setIsDefault(false);
    } catch {
      toast.error("Could not save that address. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell>
      <header className="border-b border-border px-4 pt-6 pb-5">
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl border border-border bg-secondary text-base font-black">
            {user ? user.initials : "GU"}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl leading-tight font-black tracking-tight">
              {user ? user.name : "Guest"}
            </h1>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {user ? user.email : "Sign in to keep your points and addresses"}
            </p>
          </div>

          {user ? (
            <button
              type="button"
              onClick={() => {
                signOut();
                toast("Signed out", { description: "Your cart and orders remain safely saved." });
              }}
              aria-label="Sign out"
              className="ml-auto flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-border bg-secondary px-3 text-xs font-bold text-muted-foreground transition-colors hover:text-destructive"
            >
              <LogOut className="size-4" aria-hidden />
              <span aria-hidden className="hidden sm:inline">
                Sign out
              </span>
            </button>
          ) : null}
        </div>

        {!user ? (
          <Link
            to="/login"
            className="mt-5 flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary text-xs font-black tracking-[0.1em] text-primary-foreground uppercase shadow-lg shadow-primary/25 transition-colors hover:bg-primary/90"
          >
            <LogIn className="size-4" aria-hidden />
            Sign in
          </Link>
        ) : null}

        <dl className="mt-5 grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-4">
          <StatCell label="Orders" value={String(userOrders.length)} />
          <StatCell label="Spent" value={money(spent)} />
          <StatCell label="Points" value={String(activeBalance)} />
          <StatCell label="Points used" value={String(pointsUsed)} />
        </dl>
      </header>

      <main className="space-y-6 px-4 pt-5 pb-44 md:pb-24">
        {/* Rewards wallet */}
        <section>
          <SectionLabel>Rewards</SectionLabel>
          <Panel className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="label-mono text-muted-foreground">Points balance</p>
                <p className="mt-2 font-mono text-3xl leading-none font-black tabular-nums">
                  {activeBalance}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {pointsToGo > 0
                    ? `${pointsToGo} more for ${pointsConfig.discount_percent}% off an order`
                    : `Ready to redeem — ${pointsConfig.discount_percent}% off your next order`}
                </p>
              </div>
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
                <Gift className="size-5" aria-hidden />
              </span>
            </div>

            <div className="mt-5">
              <div
                role="progressbar"
                aria-label="Progress toward your next reward"
                aria-valuemin={0}
                aria-valuemax={pointsRequired}
                aria-valuenow={Math.min(activeBalance, pointsRequired)}
                className="h-2 w-full overflow-hidden rounded-full bg-secondary"
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-700",
                    progressPercent >= 100 ? "bg-emerald-500" : "bg-primary",
                  )}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-3">
                <span className="text-[11px] text-muted-foreground">Next reward</span>
                <span className="font-mono text-[11px] font-bold tabular-nums">
                  {activeBalance} / {pointsRequired}
                </span>
              </div>
            </div>
          </Panel>
        </section>

        {/* Points history */}
        {ledger.length > 0 ? (
          <section>
            <SectionLabel>Points history</SectionLabel>
            <Panel className="divide-y divide-border overflow-hidden">
              {ledger.slice(0, 5).map((entry) => {
                const earned = entry.delta > 0;
                return (
                  <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-lg border",
                        earned
                          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "border-primary/25 bg-primary/10 text-primary",
                      )}
                    >
                      {earned ? (
                        <ArrowDownRight className="size-4" aria-hidden />
                      ) : (
                        <ArrowUpRight className="size-4" aria-hidden />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {earned ? "Earned on a delivery" : "Redeemed for a discount"}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {new Date(entry.created_at).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        · balance {entry.balance_after}
                      </p>
                    </div>

                    <span
                      className={cn(
                        "shrink-0 font-mono text-sm font-bold tabular-nums",
                        earned ? "text-emerald-600 dark:text-emerald-400" : "text-foreground",
                      )}
                    >
                      {earned ? `+${entry.delta}` : entry.delta}
                    </span>
                  </div>
                );
              })}
            </Panel>
          </section>
        ) : null}

        {/* Support */}
        <section>
          <SectionLabel
            action={
              <Link to="/support" className="text-xs font-bold text-primary hover:underline">
                Open help
              </Link>
            }
          >
            Help
          </SectionLabel>

          <Panel className="overflow-hidden">
            <div className="flex items-center gap-3 p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                <Headphones className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-bold">Support</p>
                  {supportUnreadCount > 0 ? (
                    <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[9px] font-black tracking-wider text-primary-foreground uppercase">
                      {supportUnreadCount} new
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  Chat with our team about an order or delivery
                </p>
              </div>
            </div>

            {supportTickets.length > 0 ? (
              <div className="divide-y divide-border border-t border-border">
                {supportTickets.slice(0, 3).map((t) => (
                  <Link
                    key={t.id}
                    to="/support"
                    search={{ ticketId: t.id }}
                    className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-black tracking-wider uppercase",
                            TICKET_TONES[t.status] ??
                              "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                          )}
                        >
                          {t.status.replace(/_/g, " ")}
                        </span>
                        <p className="truncate text-xs font-bold">{t.subject}</p>
                      </div>
                      {t.last_message ? (
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {t.last_message}
                        </p>
                      ) : null}
                    </div>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                      aria-hidden
                    />
                  </Link>
                ))}
              </div>
            ) : null}
          </Panel>
        </section>

        {/* Saved addresses */}
        <section>
          <SectionLabel
            action={
              <button
                type="button"
                onClick={() => {
                  setLabel("Home");
                  setStreet("");
                  setNotes("");
                  setShowAddModal(true);
                }}
                className="flex cursor-pointer items-center gap-1 text-xs font-bold text-primary hover:underline"
              >
                <Plus className="size-3.5" aria-hidden />
                Add
              </button>
            }
          >
            Delivery addresses
          </SectionLabel>

          {locations.length === 0 ? (
            <Panel className="p-6 text-center">
              <p className="text-sm font-bold">No saved addresses</p>
              <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                Add one so we can work out your delivery fee and arrival time.
              </p>
            </Panel>
          ) : (
            <div className="space-y-2">
              {locations.map((loc) => {
                const isActive = activeLocation?.id === loc.id;

                return (
                  <div
                    key={loc.id}
                    className={cn(
                      "rounded-2xl border shadow-sm transition-colors",
                      isActive ? "border-primary/40 bg-primary/5" : "border-border bg-card",
                    )}
                  >
                    <div className="flex items-start gap-3 p-4">
                      <button
                        type="button"
                        onClick={() => {
                          selectLocation(loc);
                          toast.success(`Delivering to ${loc.label}`);
                        }}
                        aria-pressed={isActive}
                        className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 text-left"
                      >
                        <span
                          className={cn(
                            "grid size-9 shrink-0 place-items-center rounded-lg border transition-colors",
                            isActive
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-secondary text-muted-foreground",
                          )}
                        >
                          <MapPin className="size-4" aria-hidden />
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-bold">{loc.label}</span>
                            {loc.is_default ? (
                              <span className="shrink-0 rounded border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-primary uppercase">
                                Default
                              </span>
                            ) : null}
                            {isActive ? (
                              <span className="shrink-0 text-[9px] font-black tracking-wider text-primary uppercase">
                                In use
                              </span>
                            ) : null}
                          </span>

                          <span className="mt-1 block truncate text-xs text-muted-foreground">
                            {loc.street}, {loc.city} {loc.postal_code}
                          </span>

                          {loc.notes ? (
                            <span className="mt-1 block truncate text-[11px] text-muted-foreground italic">
                              {loc.notes}
                            </span>
                          ) : null}
                        </span>
                      </button>

                      {locations.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => deleteLocationFromFirebase(loc.id)}
                          aria-label={`Delete ${loc.label}`}
                          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
                      <span className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                        <Compass className="size-3 shrink-0" aria-hidden />
                        <span className="truncate">
                          {loc.latitude?.toFixed(4)}, {loc.longitude?.toFixed(4)}
                        </span>
                      </span>

                      {!loc.is_default ? (
                        <button
                          type="button"
                          onClick={() => setDefaultLocation(loc.id)}
                          className="shrink-0 cursor-pointer text-[11px] font-bold text-primary hover:underline"
                        >
                          Make default
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Promo codes */}
        {campaigns.length > 0 ? (
          <section>
            <SectionLabel>Promo codes</SectionLabel>
            <Panel className="divide-y divide-border overflow-hidden">
              {campaigns.map((promo) => (
                <div key={promo.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-black text-primary">{promo.code}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {promo.name} · {promo.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(promo.code);
                      toast.success(`Copied ${promo.code}`);
                    }}
                    className="shrink-0 cursor-pointer rounded-lg border border-border bg-secondary px-3 py-1.5 text-[10px] font-black tracking-wider uppercase transition-colors hover:bg-primary hover:text-primary-foreground"
                  >
                    Copy
                  </button>
                </div>
              ))}
            </Panel>
          </section>
        ) : null}

        {/* Favourites */}
        <section>
          <SectionLabel>Favourite kitchens</SectionLabel>
          <Panel className="divide-y divide-border overflow-hidden">
            {restaurants.slice(0, 3).map((r) => (
              <Link
                key={r.slug}
                to="/restaurant/$slug"
                params={{ slug: r.slug }}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/40"
              >
                <img
                  src={r.image}
                  alt=""
                  width={1024}
                  height={640}
                  loading="lazy"
                  className="size-11 shrink-0 rounded-lg object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{r.name}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {r.tagline}
                  </span>
                </span>
                <Heart className="size-4 shrink-0 fill-primary text-primary" aria-hidden />
              </Link>
            ))}
          </Panel>
        </section>
      </main>

      {showAddModal ? (
        <div
          className="fixed inset-0 z-60 flex items-end justify-center bg-background/80 p-0 backdrop-blur-md sm:items-center sm:p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-address-title"
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl"
          >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border p-5">
              <div className="min-w-0">
                <h2 id="add-address-title" className="text-base font-black tracking-tight">
                  Add an address
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Use your current location, or fill it in yourself.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label="Close"
                className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-border bg-secondary text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            </header>

            <form onSubmit={handleAddLocationSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
                {gpsError ? (
                  <Callout
                    tone="danger"
                    title="We could not read your location"
                    action={
                      <button
                        type="button"
                        onClick={handleLiveGps}
                        className="cursor-pointer text-xs font-bold text-destructive underline"
                      >
                        Try again
                      </button>
                    }
                  >
                    Allow location for this site in your browser settings, reload the page, then try
                    again.
                  </Callout>
                ) : null}

                <div>
                  <label
                    htmlFor="address-label"
                    className="label-mono mb-2 block text-muted-foreground"
                  >
                    Nickname
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
                          aria-pressed={isSelected}
                          className={cn(
                            "flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors",
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground shadow-sm"
                              : "border-border bg-secondary text-foreground hover:border-primary/30",
                          )}
                        >
                          <Icon className="size-3.5" aria-hidden />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    id="address-label"
                    type="text"
                    placeholder="Or type your own"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    required
                    className={cn(fieldClass, "mt-2")}
                  />
                </div>

                <div>
                  <label
                    htmlFor="address-street"
                    className="label-mono mb-2 block text-muted-foreground"
                  >
                    Street address
                  </label>
                  <input
                    id="address-street"
                    type="text"
                    placeholder="242 High Street, Sandton"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    required
                    className={fieldClass}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="address-city"
                      className="label-mono mb-2 block text-muted-foreground"
                    >
                      City
                    </label>
                    <input
                      id="address-city"
                      type="text"
                      placeholder="Johannesburg"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      required
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="address-postal"
                      className="label-mono mb-2 block text-muted-foreground"
                    >
                      Postal code
                    </label>
                    <input
                      id="address-postal"
                      type="text"
                      placeholder="2000"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-secondary/50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold">Map pin</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Used to route your courier
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleLiveGps}
                      disabled={detectingGps}
                      className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[11px] font-black tracking-wider text-primary-foreground uppercase shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
                    >
                      <Crosshair
                        className={cn("size-3.5", detectingGps && "animate-spin")}
                        aria-hidden
                      />
                      {detectingGps ? "Locating…" : "Use current"}
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="address-lat"
                        className="label-mono mb-1.5 block text-muted-foreground"
                      >
                        Latitude
                      </label>
                      <input
                        id="address-lat"
                        type="number"
                        step="any"
                        placeholder="-26.2041"
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                        required
                        className={cn(fieldClass, "bg-background font-mono")}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="address-lng"
                        className="label-mono mb-1.5 block text-muted-foreground"
                      >
                        Longitude
                      </label>
                      <input
                        id="address-lng"
                        type="number"
                        step="any"
                        placeholder="28.0473"
                        value={longitude}
                        onChange={(e) => setLongitude(e.target.value)}
                        required
                        className={cn(fieldClass, "bg-background font-mono")}
                      />
                    </div>
                  </div>

                  <p className="label-mono mt-3 mb-1.5 text-muted-foreground">Or pick a city</p>
                  <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
                    {SOUTH_AFRICAN_PRESETS.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => applyPreset(p)}
                        className="shrink-0 cursor-pointer rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-bold transition-colors hover:border-primary/30 hover:text-primary"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="address-notes"
                    className="label-mono mb-2 block text-muted-foreground"
                  >
                    Notes for the courier{" "}
                    <span className="font-sans normal-case opacity-70">(optional)</span>
                  </label>
                  <input
                    id="address-notes"
                    type="text"
                    placeholder="Gate code 4421, leave at reception"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className={fieldClass}
                  />
                </div>

                <label className="flex cursor-pointer items-center gap-2.5 text-xs font-bold text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="size-4 cursor-pointer rounded accent-primary"
                  />
                  Make this my default address
                </label>
              </div>

              <div className="flex shrink-0 gap-2 border-t border-border p-5 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="h-12 flex-1 cursor-pointer rounded-xl border border-border bg-secondary text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-12 flex-[1.4] cursor-pointer rounded-xl bg-primary text-xs font-black tracking-wider text-primary-foreground uppercase shadow-lg shadow-primary/25 transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save address"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <CartBar />
      <BottomNav />
    </PageShell>
  );
}
