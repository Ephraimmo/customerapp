import { useEffect, useRef, useState } from "react";
import { MapPin, Navigation } from "lucide-react";
import type { DeliveryAddress, DriverLiveLocation } from "@/lib/data";

type Coordinates = { latitude: number; longitude: number };

type GoogleMapInstance = {
  setCenter: (center: { lat: number; lng: number }) => void;
  fitBounds: (bounds: GoogleBounds) => void;
};

type GoogleBounds = { extend: (point: { lat: number; lng: number }) => void };

type GoogleMarker = {
  setMap: (map: GoogleMapInstance | null) => void;
  setPosition: (position: { lat: number; lng: number }) => void;
};

type GoogleMapsNamespace = {
  maps: {
    Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
    Marker: new (options: Record<string, unknown>) => GoogleMarker;
    LatLngBounds: new () => GoogleBounds;
  };
};

type GoogleWindow = Window & { google?: GoogleMapsNamespace };

const GOOGLE_MAPS_API_KEY = import.meta.env["VITE_GOOGLE_MAPS_API_KEY"] as string | undefined;
const GOOGLE_MAPS_SCRIPT_ID = "hearth-google-maps-script";
let mapsLoader: Promise<GoogleMapsNamespace> | null = null;

export function loadGoogleMaps() {
  if (typeof window === "undefined") return Promise.reject(new Error("Maps require a browser"));
  const existing = (window as GoogleWindow).google;
  if (existing) return Promise.resolve(existing);
  if (!GOOGLE_MAPS_API_KEY) {
    console.error("VITE_GOOGLE_MAPS_API_KEY is missing; Google Maps cannot load.");
    return Promise.reject(new Error("Google Maps is not configured"));
  }
  if (mapsLoader) return mapsLoader;

  mapsLoader = new Promise((resolve, reject) => {
    const current = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
    if (current) {
      current.addEventListener("load", () => {
        const google = (window as GoogleWindow).google;
        if (google) {
          resolve(google);
        } else {
          reject(new Error("Google Maps did not initialize"));
        }
      });
      current.addEventListener("error", () => reject(new Error("Google Maps failed to load")));
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;
    script.onload = () => {
      const google = (window as GoogleWindow).google;
      if (google) {
        console.info("Google Maps loaded");
        resolve(google);
      } else {
        reject(new Error("Google Maps did not initialize"));
      }
    };
    script.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(script);
  });

  return mapsLoader;
}

function position(location: Coordinates) {
  return { lat: location.latitude, lng: location.longitude };
}

export function DeliveryMap({
  customerLocation,
  driverLocation,
}: {
  customerLocation: Coordinates | null;
  driverLocation: DriverLiveLocation | null;
}) {
  const mapElement = useRef<HTMLDivElement>(null);
  const map = useRef<GoogleMapInstance | null>(null);
  const initialLocation = useRef(customerLocation || driverLocation);
  const customerMarker = useRef<GoogleMarker | null>(null);
  const driverMarker = useRef<GoogleMarker | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    void loadGoogleMaps()
      .then((google) => {
        if (cancelled || !mapElement.current) return;
        const initial = initialLocation.current;
        if (!initial) {
          setStatus("error");
          return;
        }
        map.current = new google.maps.Map(mapElement.current, {
          center: position(initial),
          zoom: 14,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          zoomControl: true,
        });
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      customerMarker.current?.setMap(null);
      driverMarker.current?.setMap(null);
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (status !== "ready" || !map.current || typeof window === "undefined") return;
    const google = (window as GoogleWindow).google;
    if (!google) return;

    if (customerLocation) {
      const customerPosition = position(customerLocation);
      if (!customerMarker.current) {
        customerMarker.current = new google.maps.Marker({
          map: map.current,
          position: customerPosition,
          title: "Delivery location",
          label: "You",
        });
      } else {
        customerMarker.current.setPosition(customerPosition);
      }
    }

    if (driverLocation) {
      const driverPosition = position(driverLocation);
      if (!driverMarker.current) {
        driverMarker.current = new google.maps.Marker({
          map: map.current,
          position: driverPosition,
          title: "Driver",
          label: "D",
        });
      } else {
        driverMarker.current.setPosition(driverPosition);
      }
    }

    const locations = [customerLocation, driverLocation].filter(Boolean) as Coordinates[];
    if (locations.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      locations.forEach((location) => bounds.extend(position(location)));
      map.current.fitBounds(bounds);
    } else if (locations[0]) {
      map.current.setCenter(position(locations[0]));
    }
  }, [customerLocation, driverLocation, status]);

  if (status === "error") {
    return (
      <div className="flex h-full min-h-56 flex-col items-center justify-center gap-2 bg-secondary p-6 text-center">
        <MapPin className="size-6 text-muted-foreground" />
        <p className="text-sm font-bold">Map temporarily unavailable.</p>
        <p className="text-xs text-muted-foreground">
          Your delivery status is still updating live.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-56 w-full">
      <div ref={mapElement} className="absolute inset-0" aria-label="Delivery map" />
      {status === "loading" ? (
        <div className="absolute inset-0 grid place-items-center bg-secondary/90">
          <div className="flex items-center gap-2 rounded-full bg-background px-4 py-2 text-xs font-bold shadow ring-1 ring-border">
            <Navigation className="size-4 animate-pulse text-primary" /> Loading map...
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function deliveryAddressCoordinates(address: DeliveryAddress | null | undefined) {
  if (address?.latitude == null || address.longitude == null) return null;
  return { latitude: address.latitude, longitude: address.longitude };
}
