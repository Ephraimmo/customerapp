import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { useAuth } from "./auth";
import { rtdbRemove, rtdbSet, rtdbSubscribe } from "./firebase";
import type { DeliveryAddress } from "./data";

export interface SavedLocation extends DeliveryAddress {
  id: string;
  is_default?: boolean;
  created_at?: string;
  source?: "gps" | "manual" | "saved";
}

export interface GpsCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
}

export type LocationSelectionMode = "saved" | "current_gps" | "manual";

export interface CityPreset {
  name: string;
  street: string;
  city: string;
  postal_code: string;
  latitude: number;
  longitude: number;
}

export const SOUTH_AFRICAN_PRESETS: CityPreset[] = [
  {
    name: "Johannesburg CBD",
    street: "242 High Street, Marshalltown",
    city: "Johannesburg",
    postal_code: "2001",
    latitude: -26.2041,
    longitude: 28.0473,
  },
  {
    name: "Sandton Central",
    street: "83 Rivonia Road, Sandhurst",
    city: "Sandton",
    postal_code: "2196",
    latitude: -26.1076,
    longitude: 28.0567,
  },
  {
    name: "Rosebank Precinct",
    street: "15 Cradock Avenue, Rosebank",
    city: "Johannesburg",
    postal_code: "2196",
    latitude: -26.1465,
    longitude: 28.0416,
  },
  {
    name: "Melville",
    street: "88 7th Street, Melville",
    city: "Johannesburg",
    postal_code: "2092",
    latitude: -26.1755,
    longitude: 28.0076,
  },
  {
    name: "Pretoria East",
    street: "124 Menlo Park Way, Hazelwood",
    city: "Pretoria",
    postal_code: "0081",
    latitude: -25.7725,
    longitude: 28.2589,
  },
  {
    name: "Cape Town CBD",
    street: "100 Bree Street, City Bowl",
    city: "Cape Town",
    postal_code: "8001",
    latitude: -33.9249,
    longitude: 18.4241,
  },
  {
    name: "Durban Umhlanga",
    street: "18 Lagoon Drive, Umhlanga",
    city: "Durban",
    postal_code: "4320",
    latitude: -29.7289,
    longitude: 31.0858,
  },
];

// ZERO demo locations — purely real customer-saved addresses in Firebase
export const INITIAL_SAVED_LOCATIONS: SavedLocation[] = [];

const LOCATIONS_STORAGE_KEY = "hearth.saved_locations.v3";
const ACTIVE_LOCATION_ID_KEY = "hearth.active_location_id.v3";
const GOOGLE_MAPS_API_KEY =
  (import.meta.env["VITE_GOOGLE_MAPS_API_KEY"] as string | undefined) ||
  "AIzaSyBGk21FLLXX7IZcV9HtT821KM3Be0MHYMg";

const FALLBACK_DEFAULT_LOCATION: SavedLocation = {
  id: "loc_default",
  label: "Current GPS",
  street: "Detecting location…",
  city: "Johannesburg",
  postal_code: "2000",
  latitude: -26.2041,
  longitude: 28.0473,
  notes: null,
  is_default: true,
  source: "gps",
};

interface LocationContextType {
  locations: SavedLocation[];
  activeLocation: SavedLocation | null;
  selectionMode: LocationSelectionMode;
  setSelectionMode: (mode: LocationSelectionMode) => void;
  gpsCoordinates: GpsCoordinates | null;
  gpsStatus: "idle" | "detecting" | "success" | "error";
  gpsError: string | null;
  detectGpsLocation: (options?: {
    saveToFirebase?: boolean;
    label?: string;
  }) => Promise<GpsCoordinates | null>;
  saveLocationToFirebase: (loc: Omit<SavedLocation, "id"> & { id?: string }) => Promise<string>;
  deleteLocationFromFirebase: (id: string) => Promise<void>;
  selectLocation: (location: SavedLocation | string) => void;
  setDefaultLocation: (id: string) => Promise<void>;
  syncing: boolean;
}

const LocationContext = createContext<LocationContextType | null>(null);

function locationsFirebasePath(uid: string) {
  return `customerAddresses/${uid}`;
}

async function reverseGeocodeCoordinates(coords: GpsCoordinates) {
  if (!GOOGLE_MAPS_API_KEY) return null;

  const params = new URLSearchParams({
    latlng: `${coords.latitude},${coords.longitude}`,
    key: GOOGLE_MAPS_API_KEY,
  });
  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
  if (!response.ok) throw new Error(`Google Geocoding request failed (${response.status})`);

  const data = (await response.json()) as {
    status: string;
    results?: Array<{
      formatted_address?: string;
      address_components?: Array<{ long_name: string; types: string[] }>;
    }>;
  };
  if (data.status !== "OK" || !data.results?.[0]) return null;

  const result = data.results[0];
  const component = (type: string) =>
    result.address_components?.find((item) => item.types.includes(type))?.long_name || "";
  const street = [component("street_number"), component("route")].filter(Boolean).join(" ");

  return {
    street: street || result.formatted_address || `${coords.latitude}, ${coords.longitude}`,
    city:
      component("locality") ||
      component("postal_town") ||
      component("administrative_area_level_2"),
    postal_code: component("postal_code"),
  };
}

function locationFromCoordinates(
  coords: GpsCoordinates,
  address?: Awaited<ReturnType<typeof reverseGeocodeCoordinates>>,
  id = `gps_${Date.now()}`,
): SavedLocation {
  return {
    id,
    label: "Current GPS Position",
    street: address?.street || `GPS Fix (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`,
    city: address?.city || "",
    postal_code: address?.postal_code || "",
    latitude: coords.latitude,
    longitude: coords.longitude,
    notes: `Accurate within ~${coords.accuracy ?? 10}m`,
    source: "gps",
  };
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState<LocationSelectionMode>("saved");
  const [gpsCoordinates, setGpsCoordinates] = useState<GpsCoordinates | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "detecting" | "success" | "error">("idle");
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Initialize from local cache (migrating away from demo locations)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LOCATIONS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedLocation[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Filter out any obsolete demo IDs
          const real = parsed.filter((l) => l.id !== "loc_home" && l.id !== "loc_work");
          setLocations(real);
        }
      }
      const rawActive = window.localStorage.getItem(ACTIVE_LOCATION_ID_KEY);
      if (rawActive && rawActive !== "loc_home" && rawActive !== "loc_work") {
        setActiveLocationId(rawActive);
      }
    } catch {
      /* ignore storage errors */
    }
    setHydrated(true);
  }, []);

  // Save to local storage
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(LOCATIONS_STORAGE_KEY, JSON.stringify(locations));
      if (activeLocationId) {
        window.localStorage.setItem(ACTIVE_LOCATION_ID_KEY, activeLocationId);
      }
    } catch {
      /* storage quota */
    }
  }, [locations, activeLocationId, hydrated]);

  // Keep the app pinned to the device's live GPS while there is no saved address selected.
  useEffect(() => {
    if (!hydrated || typeof window === "undefined" || !("geolocation" in navigator)) return;
    if (locations.length > 0 || activeLocationId) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords: GpsCoordinates = {
          latitude: Math.round(pos.coords.latitude * 100000) / 100000,
          longitude: Math.round(pos.coords.longitude * 100000) / 100000,
          accuracy: Math.round(pos.coords.accuracy),
          timestamp: pos.timestamp,
        };

        setGpsCoordinates(coords);
        setGpsStatus("success");
        setGpsError(null);

        setLocations((prev) => {
          const withoutPrevGps = prev.filter((p) => p.source !== "gps");
          return [locationFromCoordinates(coords, null, "gps_current"), ...withoutPrevGps];
        });
        setActiveLocationId("gps_current");
        setSelectionMode("current_gps");

        void reverseGeocodeCoordinates(coords)
          .then((address) => {
            if (!address) return;
            setLocations((prev) =>
              prev.map((location) =>
                location.id === "gps_current" ? locationFromCoordinates(coords, address, location.id) : location,
              ),
            );
          })
          .catch((error) => console.warn("Google reverse geocoding unavailable:", error));
      },
      (err) => {
        console.warn("Live GPS watch unavailable:", err.message);
        setGpsStatus("error");
        setGpsError(err.message || "Using fallback coordinates");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [hydrated, locations.length, activeLocationId]);

  // Synchronize with Firebase Realtime Database for signed-in user
  useEffect(() => {
    if (!user || !hydrated) return;
    setSyncing(true);

    const unsubscribe = rtdbSubscribe<Record<string, SavedLocation>>(
      locationsFirebasePath(user.uid),
      (remoteLocations) => {
        setSyncing(false);
        if (remoteLocations && Object.keys(remoteLocations).length > 0) {
          const list = Object.entries(remoteLocations)
            .filter(([id]) => id !== "loc_home" && id !== "loc_work")
            .map(([id, item]) => ({
              ...item,
              id: item.id || id,
            }));
          setLocations(list);
          if (list.length > 0 && !activeLocationId) {
            const def = list.find((l) => l.is_default) || list[0]!;
            setActiveLocationId(def.id);
          }
        } else {
          setLocations([]);
        }
      },
    );

    return () => {
      unsubscribe();
    };
  }, [user, hydrated, activeLocationId]);

  // One-click GPS Location detection
  const detectGpsLocation = useCallback(
    async (options?: {
      saveToFirebase?: boolean;
      label?: string;
    }): Promise<GpsCoordinates | null> => {
      setGpsStatus("detecting");
      setGpsError(null);

      if (typeof window === "undefined" || !("geolocation" in navigator)) {
        const message = "Location services are unavailable in this browser.";
        setGpsStatus("error");
        setGpsError(message);
        toast.error(message);
        return null;
      }

      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const coords: GpsCoordinates = {
              latitude: Math.round(pos.coords.latitude * 100000) / 100000,
              longitude: Math.round(pos.coords.longitude * 100000) / 100000,
              accuracy: Math.round(pos.coords.accuracy),
              timestamp: pos.timestamp,
            };
            setGpsCoordinates(coords);
            setGpsStatus("success");

            const address = await reverseGeocodeCoordinates(coords).catch((error) => {
              console.warn("Google reverse geocoding unavailable:", error);
              return null;
            });
            const currentGpsLoc = locationFromCoordinates(coords, address ?? undefined);
            currentGpsLoc.label = options?.label || currentGpsLoc.label;

            if (options?.saveToFirebase) {
              await saveLocationToFirebase(currentGpsLoc);
            }

            setLocations((prev) => {
              const withoutPrevGps = prev.filter((p) => p.source !== "gps");
              return [currentGpsLoc, ...withoutPrevGps];
            });
            setActiveLocationId(currentGpsLoc.id);
            setSelectionMode("current_gps");

            toast.success("GPS Location Detected", {
              description: `Coordinates: ${coords.latitude}, ${coords.longitude}`,
            });
            resolve(coords);
          },
          (err) => {
            console.warn("Could not detect live GPS location:", err.message);
            setGpsStatus("error");
            setGpsError(err.message || "Could not detect your current location.");
            toast.error("Could not detect your current location", {
              description: "Check browser location permissions and try again.",
            });
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 },
        );
      });
    },
    [],
  );

  // Save location to Firebase Realtime Database
  const saveLocationToFirebase = useCallback(
    async (loc: Omit<SavedLocation, "id"> & { id?: string }): Promise<string> => {
      const id =
        loc.id ||
        `loc_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36).slice(-4)}`;
      const newLocation: SavedLocation = {
        ...loc,
        id,
        created_at: loc.created_at || new Date().toISOString(),
      };

      setLocations((prev) => {
        const filtered = prev.filter((p) => p.id !== id);
        return [newLocation, ...filtered];
      });
      setActiveLocationId(id);

      // If user is logged in, write directly to Firebase RTDB
      if (user) {
        try {
          await rtdbSet(`customerAddresses/${user.uid}/${id}`, newLocation);
        } catch (error) {
          console.warn("Could not save location to Firebase:", error);
        }
      }

      // Also persist to global saved locations node in Firebase for dispatching
      try {
        await rtdbSet(`savedLocations/${id}`, newLocation);
      } catch {
        /* best effort */
      }

      toast.success("Location saved to database!", {
        description: `${newLocation.label} (${newLocation.latitude}, ${newLocation.longitude})`,
      });

      return id;
    },
    [user],
  );

  // Delete location from Firebase Realtime Database
  const deleteLocationFromFirebase = useCallback(
    async (id: string): Promise<void> => {
      setLocations((prev) => prev.filter((p) => p.id !== id));
      if (activeLocationId === id) {
        const remaining = locations.filter((l) => l.id !== id);
        setActiveLocationId(remaining[0]?.id || null);
      }

      if (user) {
        try {
          await rtdbRemove(`customerAddresses/${user.uid}/${id}`);
        } catch (error) {
          console.warn("Could not remove location from Firebase:", error);
        }
      }

      try {
        await rtdbRemove(`savedLocations/${id}`);
      } catch {
        /* best effort */
      }

      toast.success("Address removed");
    },
    [user, activeLocationId, locations],
  );

  const selectLocation = useCallback((locationOrId: SavedLocation | string) => {
    if (typeof locationOrId === "string") {
      setActiveLocationId(locationOrId);
      setSelectionMode("saved");
    } else {
      setActiveLocationId(locationOrId.id);
      setSelectionMode(locationOrId.source === "gps" ? "current_gps" : "saved");
    }
  }, []);

  const setDefaultLocation = useCallback(
    async (id: string) => {
      setLocations((prev) =>
        prev.map((loc) => ({
          ...loc,
          is_default: loc.id === id,
        })),
      );
      setActiveLocationId(id);

      if (user) {
        try {
          await rtdbSet(`customerAddresses/${user.uid}/${id}/is_default`, true);
        } catch {
          /* best effort */
        }
      }
      toast.success("Default address updated");
    },
    [user],
  );

  const activeLocation = useMemo<SavedLocation | null>(() => {
    if (!locations || locations.length === 0) return null;
    const found = locations.find((l) => l.id === activeLocationId);
    if (found) return found;
    return locations[0] ?? null;
  }, [locations, activeLocationId]);

  const value = useMemo<LocationContextType>(
    () => ({
      locations,
      activeLocation,
      selectionMode,
      setSelectionMode,
      gpsCoordinates,
      gpsStatus,
      gpsError,
      detectGpsLocation,
      saveLocationToFirebase,
      deleteLocationFromFirebase,
      selectLocation,
      setDefaultLocation,
      syncing,
    }),
    [
      locations,
      activeLocation,
      selectionMode,
      gpsCoordinates,
      gpsStatus,
      gpsError,
      detectGpsLocation,
      saveLocationToFirebase,
      deleteLocationFromFirebase,
      selectLocation,
      setDefaultLocation,
      syncing,
    ],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

const DEFAULT_LOCATION_FALLBACK: LocationContextType = {
  locations: [],
  activeLocation: null,
  selectionMode: "saved",
  setSelectionMode: () => {},
  gpsCoordinates: { latitude: -26.2041, longitude: 28.0473 },
  gpsStatus: "idle",
  gpsError: null,
  detectGpsLocation: async () => ({ latitude: -26.2041, longitude: 28.0473 }),
  saveLocationToFirebase: async (loc) => loc.id || "loc_new",
  deleteLocationFromFirebase: async () => {},
  selectLocation: () => {},
  setDefaultLocation: async () => {},
  syncing: false,
};

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) return DEFAULT_LOCATION_FALLBACK;
  return ctx;
}
