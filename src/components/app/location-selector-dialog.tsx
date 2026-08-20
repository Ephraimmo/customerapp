import { useState } from "react";
import {
  Briefcase,
  Building,
  Check,
  Compass,
  Crosshair,
  Home,
  MapPin,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { SOUTH_AFRICAN_PRESETS, useLocation, type CityPreset } from "@/lib/location";

const LABEL_SUGGESTIONS = [
  { label: "Home", icon: Home },
  { label: "Work", icon: Briefcase },
  { label: "Apartment", icon: Building },
  { label: "Other", icon: Sparkles },
];

export function LocationSelectorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    locations,
    activeLocation,
    selectLocation,
    saveLocationToFirebase,
    deleteLocationFromFirebase,
  } = useLocation();

  const [isAdding, setIsAdding] = useState(false);
  const [label, setLabel] = useState("Home");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("Johannesburg");
  const [postalCode, setPostalCode] = useState("2000");
  const [latitude, setLatitude] = useState("-26.2041");
  const [longitude, setLongitude] = useState("28.0473");
  const [notes, setNotes] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [detectingGps, setDetectingGps] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  // Live GPS auto-detects only Latitude & Longitude, leaving all other fields manual
  function handleLiveGps() {
    setDetectingGps(true);
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setLatitude("-26.2041");
      setLongitude("28.0473");
      setDetectingGps(false);
      toast.info("GPS coordinates filled (-26.2041, 28.0473)");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 100000) / 100000;
        const lng = Math.round(pos.coords.longitude * 100000) / 100000;
        setLatitude(lat.toString());
        setLongitude(lng.toString());
        setDetectingGps(false);
        toast.success("Live GPS coordinates detected!", {
          description: `Lat: ${lat}° • Lng: ${lng}° (Accuracy: ±${Math.round(pos.coords.accuracy)}m)`,
        });
      },
      (err) => {
        console.warn("GPS error:", err.message);
        setLatitude("-26.2041");
        setLongitude("28.0473");
        setDetectingGps(false);
        toast.info("Default coordinates applied (-26.2041, 28.0473)");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 },
    );
  }

  function applyPreset(preset: CityPreset) {
    setStreet(preset.street);
    setCity(preset.city);
    setPostalCode(preset.postal_code);
    setLatitude(preset.latitude.toString());
    setLongitude(preset.longitude.toString());
    toast.info(`Preset selected: ${preset.name}`);
  }

  async function handleSaveLocation(e: React.FormEvent) {
    e.preventDefault();
    const lat = Number.parseFloat(latitude);
    const lng = Number.parseFloat(longitude);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      toast.error("Please enter valid numeric coordinates for Latitude and Longitude.");
      return;
    }

    setSaving(true);
    try {
      await saveLocationToFirebase({
        label: label.trim() || "Delivery Location",
        street: street.trim() || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        city: city.trim() || "Johannesburg",
        postal_code: postalCode.trim() || "2000",
        latitude: lat,
        longitude: lng,
        notes: notes.trim() || null,
        is_default: isDefault,
        source: "saved",
      });
      setIsAdding(false);
      onClose();
    } catch {
      toast.error("Failed to save location to Firebase.");
    } finally {
      setSaving(false);
    }
  }

  const showList = !isAdding && locations.length > 0;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4">
      {/* Dark frosted overlay */}
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/50 backdrop-blur-md transition-opacity"
      />

      {/* Main Dialog Card with Fixed Header, Scrollable Body & Sticky Action Footer */}
      <div
        role="dialog"
        aria-label="Select Delivery Location"
        className="relative z-10 flex flex-col w-full max-w-lg max-h-[90vh] overflow-hidden rounded-[28px] bg-card border border-border/80 shadow-2xl animate-[var(--animate-sheet-up)]"
      >
        {/* Fixed Header */}
        <div className="flex items-center justify-between border-b border-border/80 bg-secondary/40 px-5 sm:px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="grid size-10 sm:size-11 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/25">
              <MapPin className="size-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-foreground">
                {showList ? "Delivery Addresses" : "Add Delivery Address"}
              </h2>
              <p className="text-[11px] sm:text-xs text-muted-foreground">
                {showList
                  ? `Saved in Firebase Database (${locations.length})`
                  : "Manual details • Click Live GPS for coordinates"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (isAdding && locations.length > 0) {
                setIsAdding(false);
              } else {
                onClose();
              }
            }}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 ring-1 ring-border cursor-pointer transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* VIEW 1: Saved Locations List */}
        {showList ? (
          <>
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3 overscroll-contain">
              {locations.map((loc) => {
                const isActive = activeLocation?.id === loc.id;
                return (
                  <div
                    key={loc.id}
                    className={`group relative flex items-start justify-between rounded-2xl p-4 border transition-all ${
                      isActive
                        ? "bg-primary/10 border-primary/40 shadow-sm"
                        : "bg-secondary/40 border-border hover:bg-secondary hover:border-border/80"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        selectLocation(loc);
                        onClose();
                        toast.success(`Active location: ${loc.label}`);
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
                        {isActive ? <Check className="size-4" /> : <MapPin className="size-4" />}
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
                          {loc.street}, {loc.city}
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
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteLocationFromFirebase(loc.id);
                      }}
                      aria-label={`Delete ${loc.label}`}
                      className="opacity-0 group-hover:opacity-100 size-8 grid place-items-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all cursor-pointer ml-2"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Sticky Action Footer */}
            <div className="border-t border-border bg-card p-4 sm:p-5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setLabel("Home");
                  setStreet("");
                  setNotes("");
                  setIsAdding(true);
                }}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-xs font-black tracking-wider uppercase text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 cursor-pointer transition-all active:scale-[0.98]"
              >
                <Plus className="size-4" />
                Add New Delivery Location
              </button>
            </div>
          </>
        ) : (
          /* VIEW 2: Single Unified Add Location Form */
          <form
            onSubmit={handleSaveLocation}
            className="flex flex-col flex-1 min-h-0 overflow-hidden"
          >
            {/* Scrollable Form Body */}
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

              {/* Coordinates Section with Live GPS Auto-fill Button & Editable Lat/Lng */}
              <div className="rounded-2xl bg-secondary/50 p-4 border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="block text-xs font-black text-foreground">
                      Geographic GPS Coordinates
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Auto-fill via Live GPS or edit numbers directly
                    </span>
                  </div>

                  {/* Live GPS Button */}
                  <button
                    type="button"
                    onClick={handleLiveGps}
                    disabled={detectingGps}
                    className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-black tracking-wider uppercase text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 active:scale-95 transition-all cursor-pointer disabled:opacity-60"
                  >
                    <Crosshair className={`size-3.5 ${detectingGps ? "animate-spin" : ""}`} />
                    {detectingGps ? "Acquiring…" : "Live GPS"}
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
                      placeholder="-26.2041"
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
                      placeholder="28.0473"
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                      required
                      className="h-10 w-full rounded-xl bg-background px-3 font-mono text-xs border border-border outline-none focus:ring-2 focus:ring-primary/30 font-bold"
                    />
                  </div>
                </div>

                {/* Quick SA Presets */}
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
                  placeholder="e.g. Gate code #4421, 3rd floor reception"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="h-11 w-full rounded-xl bg-secondary/70 px-3.5 text-xs border border-border outline-none focus:ring-2 focus:ring-primary/30 font-medium"
                />
              </div>
            </div>

            {/* Sticky Action Footer */}
            <div className="flex gap-2.5 border-t border-border bg-card p-4 sm:p-5 shrink-0">
              {locations.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="h-12 flex-1 rounded-2xl bg-secondary text-xs font-bold text-foreground border border-border hover:bg-secondary/80 transition-colors cursor-pointer"
                >
                  Back to List
                </button>
              ) : null}
              <button
                type="submit"
                disabled={saving}
                className="h-12 flex-1 rounded-2xl bg-primary text-xs font-black tracking-wider uppercase text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60"
              >
                {saving ? "Saving to Firebase…" : "Save Location"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
