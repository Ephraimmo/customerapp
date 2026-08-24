import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, Layers, MapPin, Navigation } from "lucide-react";
import { toast } from "sonner";
import { loadGoogleMaps } from "./delivery-map";
import { reverseGeocodeCoordinates, SOUTH_AFRICAN_PRESETS, useLocation } from "@/lib/location";

const SETTLE_DELAY_MS = 1000;
const DEFAULT_ZOOM = 16;

type GoogleLatLng = { lat: () => number; lng: () => number };
type GoogleEventListener = { remove: () => void };
type GooglePickerMap = {
  addListener: (event: string, handler: () => void) => GoogleEventListener;
  getCenter: () => GoogleLatLng | null;
  panTo: (position: { lat: number; lng: number }) => void;
  setCenter: (position: { lat: number; lng: number }) => void;
  setMapTypeId: (mapTypeId: "roadmap" | "satellite") => void;
};
type GoogleMapsNamespace = {
  maps: {
    Map: new (element: HTMLElement, options: Record<string, unknown>) => GooglePickerMap;
  };
};

export interface PickedLocationDetails {
  latitude: number;
  longitude: number;
  street: string | null;
  city: string | null;
  postal_code: string | null;
  description: string | null;
}

interface MapLocationPickerProps {
  initialLatitude?: number | null;
  initialLongitude?: number | null;
  onBack: () => void;
  onConfirm: (details: PickedLocationDetails) => Promise<void>;
}

function fallbackPreset() {
  return (
    SOUTH_AFRICAN_PRESETS[0] ?? {
      name: "Johannesburg CBD",
      street: "",
      city: "",
      postal_code: "",
      latitude: -26.2041,
      longitude: 28.0473,
    }
  );
}

export function MapLocationPicker({
  initialLatitude,
  initialLongitude,
  onBack,
  onConfirm,
}: MapLocationPickerProps) {
  const { gpsCoordinates, detectGpsLocation, gpsError } = useLocation();

  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GooglePickerMap | null>(null);
  const settleTimer = useRef<number | null>(null);
  const geocodeSequence = useRef(0);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [mapType, setMapType] = useState<"roadmap" | "satellite">("roadmap");
  const [selected, setSelected] = useState(() => ({
    latitude: initialLatitude ?? gpsCoordinates?.latitude ?? fallbackPreset().latitude,
    longitude: initialLongitude ?? gpsCoordinates?.longitude ?? fallbackPreset().longitude,
  }));
  const [address, setAddress] = useState<{
    street: string;
    city: string;
    postal_code: string;
  } | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [moving, setMoving] = useState(false);
  const [description, setDescription] = useState("");
  const [recentring, setRecentring] = useState(false);
  const [saving, setSaving] = useState(false);

  const resolveAddress = useCallback(
    async (latitude: number, longitude: number, sequence: number) => {
      setGeocoding(true);
      try {
        const result = await reverseGeocodeCoordinates({ latitude, longitude });
        if (sequence !== geocodeSequence.current) return;
        if (result?.street) {
          setAddress(result);
        } else {
          // No formal address (rural / farm / unnamed road) — coordinates remain the source of truth.
          setAddress(null);
        }
      } catch {
        // A reverse-geocoding failure must never block selecting or confirming the location.
        if (sequence === geocodeSequence.current) setAddress(null);
      } finally {
        if (sequence === geocodeSequence.current) setGeocoding(false);
      }
    },
    [],
  );

  const settleOnCenter = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      const center = map.getCenter();
      if (!center) return;
      const latitude = center.lat();
      const longitude = center.lng();
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      setSelected({ latitude, longitude });
      void resolveAddress(latitude, longitude, ++geocodeSequence.current);
    } catch {
      /* map not initialised yet */
    }
  }, [resolveAddress]);

  const scheduleSettle = useCallback(() => {
    setMoving(true);
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      setMoving(false);
      settleOnCenter();
    }, SETTLE_DELAY_MS);
  }, [settleOnCenter]);

  useEffect(() => {
    let cancelled = false;
    let listener: GoogleEventListener | null = null;

    void loadGoogleMaps()
      .then((google) => {
        if (cancelled || !mapElement.current || typeof window === "undefined") return;
        const g = google as unknown as GoogleMapsNamespace | undefined;
        if (!g?.maps?.Map) {
          setStatus("error");
          return;
        }
        const center = {
          lat: initialLatitude ?? gpsCoordinates?.latitude ?? fallbackPreset().latitude,
          lng: initialLongitude ?? gpsCoordinates?.longitude ?? fallbackPreset().longitude,
        };
        const map = new g.maps.Map(mapElement.current, {
          center,
          zoom: DEFAULT_ZOOM,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          zoomControl: true,
          gestureHandling: "greedy",
        });
        mapRef.current = map;
        listener = map.addListener("center_changed", scheduleSettle);
        setStatus("ready");
        settleOnCenter();
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      listener?.remove();
      if (settleTimer.current) {
        window.clearTimeout(settleTimer.current);
        settleTimer.current = null;
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleMapTypeChange(next: "roadmap" | "satellite") {
    setMapType(next);
    // Switching layout never resets the selected location.
    mapRef.current?.setMapTypeId(next);
  }

  async function handleRecenter() {
    if (recentring || status !== "ready") return;
    setRecentring(true);
    try {
      let coords = gpsCoordinates;
      if (!coords) {
        coords = await detectGpsLocation();
      }
      if (coords && mapRef.current) {
        mapRef.current.panTo({ lat: coords.latitude, lng: coords.longitude });
        scheduleSettle();
      }
    } finally {
      setRecentring(false);
    }
  }

  function handleConfirm() {
    const { latitude, longitude } = selected;
    const validLatitude = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90;
    const validLongitude = Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
    if (!validLatitude || !validLongitude) {
      toast.error("Invalid coordinates", {
        description: "Move the map to a valid position before confirming.",
      });
      return;
    }
    setSaving(true);
    void (async () => {
      try {
        await onConfirm({
          latitude,
          longitude,
          street: address?.street ?? null,
          city: address?.city ?? null,
          postal_code: address?.postal_code ?? null,
          description: description.trim() || null,
        });
      } finally {
        setSaving(false);
      }
    })();
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Interactive map with fixed centre pin */}
      <div className="relative h-[40vh] min-h-60 w-full shrink-0 overflow-hidden bg-secondary">
        <div ref={mapElement} className="absolute inset-0" aria-label="Location picker map" />

        {/* Fixed centre marker — the customer moves the MAP underneath it */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full">
          <MapPin
            className={`size-9 fill-primary text-primary-foreground drop-shadow-lg transition-transform ${moving ? "scale-90" : ""}`}
            strokeWidth={1.5}
            aria-hidden
          />
        </div>

        {/* Map layout switcher — Standard / Satellite */}
        {status === "ready" ? (
          <div className="absolute left-3 top-3 z-10 flex overflow-hidden rounded-full bg-background/95 shadow-md ring-1 ring-border text-[10px] font-black uppercase tracking-wider">
            <button
              type="button"
              onClick={() => handleMapTypeChange("roadmap")}
              aria-pressed={mapType === "roadmap"}
              className={`flex items-center gap-1 px-3 py-1.5 transition-colors cursor-pointer ${
                mapType === "roadmap"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers className="size-3" />
              Standard
            </button>
            <button
              type="button"
              onClick={() => handleMapTypeChange("satellite")}
              aria-pressed={mapType === "satellite"}
              className={`px-3 py-1.5 transition-colors cursor-pointer ${
                mapType === "satellite"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Satellite
            </button>
          </div>
        ) : null}

        {/* Recenter on current GPS position */}
        {status === "ready" ? (
          <button
            type="button"
            onClick={() => void handleRecenter()}
            disabled={recentring}
            aria-label="Use current location"
            title="Use Current Location"
            className="absolute bottom-3 right-3 z-10 grid size-11 place-items-center rounded-full bg-background/95 text-primary shadow-md ring-1 ring-border hover:bg-background active:scale-95 transition-all cursor-pointer disabled:opacity-60"
          >
            <Navigation className={`size-4.5 ${recentring ? "animate-pulse" : ""}`} />
          </button>
        ) : null}

        {/* Permission / GPS failure notice — manual selection stays available */}
        {status === "ready" && gpsError ? (
          <div className="absolute inset-x-3 bottom-16 z-10 rounded-xl bg-background/95 p-2.5 text-[11px] shadow-md ring-1 ring-border">
            <p className="font-bold text-destructive">We couldn't access your current location.</p>
            <p className="mt-0.5 text-muted-foreground">
              No problem — move the map so the pin sits exactly where you are, then confirm.
            </p>
          </div>
        ) : null}

        {status === "loading" ? (
          <div className="absolute inset-0 z-20 grid place-items-center bg-secondary/90">
            <div className="flex items-center gap-2 rounded-full bg-background px-4 py-2 text-xs font-bold shadow ring-1 ring-border">
              <Crosshair className="size-4 animate-pulse text-primary" /> Loading map...
            </div>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 p-6 text-center">
            <MapPin className="size-6 text-muted-foreground" />
            <p className="text-sm font-bold">Map temporarily unavailable.</p>
            <p className="text-xs text-muted-foreground">
              You can still enter your coordinates manually in the form.
            </p>
            <button
              type="button"
              onClick={onBack}
              className="mt-1 rounded-xl bg-primary px-4 py-2 text-xs font-black uppercase tracking-wider text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors cursor-pointer"
            >
              Back
            </button>
          </div>
        ) : null}
      </div>

      {/* Scrollable details below the map */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-4">
        <div className="rounded-2xl bg-secondary/50 p-4 border border-border space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Selected Location
            </span>
            {moving ? (
              <span className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary border border-primary/20">
                <Crosshair className="size-3 animate-spin" /> Move map…
              </span>
            ) : null}
          </div>

          <p className="text-sm font-bold leading-snug">
            {address?.street || <span className="text-foreground/80">Exact location selected</span>}
          </p>
          {!address && !geocoding ? (
            <p className="text-[11px] text-muted-foreground">
              No street address here — GPS coordinates will guide your driver.
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
            <div className="rounded-lg bg-primary/5 px-2.5 py-1.5 border border-primary/15">
              <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Latitude
              </span>
              <span className="font-bold text-primary">{selected.latitude.toFixed(6)}</span>
            </div>
            <div className="rounded-lg bg-primary/5 px-2.5 py-1.5 border border-primary/15">
              <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Longitude
              </span>
              <span className="font-bold text-primary">{selected.longitude.toFixed(6)}</span>
            </div>
          </div>

          {geocoding ? (
            <p className="text-[11px] text-muted-foreground animate-pulse">Looking up address…</p>
          ) : null}
        </div>

        {/* Optional landmark / directions */}
        <div>
          <label
            htmlFor="map-picker-description"
            className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5"
          >
            Additional directions / landmark{" "}
            <span className="opacity-70 font-normal lowercase">(optional)</span>
          </label>
          <input
            id="map-picker-description"
            type="text"
            placeholder="e.g. Blue gate next to the church, farm entrance 500m after the road"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            className="h-11 w-full rounded-xl bg-secondary/70 px-3.5 text-xs border border-border outline-none focus:ring-2 focus:ring-primary/30 font-medium"
          />
        </div>
      </div>

      {/* Sticky action footer */}
      <div className="flex gap-2.5 border-t border-border bg-card p-4 sm:p-5 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="h-12 flex-1 rounded-2xl bg-secondary text-xs font-bold text-foreground border border-border hover:bg-secondary/80 transition-colors cursor-pointer"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={saving || status !== "ready"}
          className="h-12 flex-[2] rounded-2xl bg-primary text-xs font-black tracking-wider uppercase text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60"
        >
          {saving ? "Saving…" : "Confirm Location"}
        </button>
      </div>
    </div>
  );
}
