import { useEffect, useRef, useState } from "react";
import type * as LeafletNamespace from "leaflet";
import { MapPin, Navigation } from "lucide-react";
import type { DeliveryAddress, DriverLiveLocation } from "@/lib/data";
import { isValidCoordinate, loadLeaflet, OSM_ATTRIBUTION, OSM_TILES } from "@/lib/osm-map";

type Coordinates = { latitude: number; longitude: number };

export function DeliveryMap({
  customerLocation,
  driverLocation,
}: {
  customerLocation: Coordinates | null;
  driverLocation: DriverLiveLocation | null;
}) {
  const mapElement = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletNamespace.Map | null>(null);
  const leaflet = useRef<typeof LeafletNamespace | null>(null);
  const customerMarker = useRef<LeafletNamespace.Marker | null>(null);
  const driverMarker = useRef<LeafletNamespace.Marker | null>(null);
  const initialLocation = useRef(customerLocation || driverLocation);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    void loadLeaflet()
      .then((L) => {
        if (cancelled || !mapElement.current) return;
        const initial = initialLocation.current;
        if (!initial || !isValidCoordinate(initial.latitude, initial.longitude)) {
          setStatus("error");
          return;
        }
        leaflet.current = L;
        const instance = L.map(mapElement.current, {
          center: [initial.latitude, initial.longitude],
          zoom: 14,
          zoomControl: true,
          attributionControl: true,
        });
        L.tileLayer(OSM_TILES, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(instance);
        map.current = instance;
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      customerMarker.current = null;
      driverMarker.current = null;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const L = leaflet.current;
    const instance = map.current;
    if (status !== "ready" || !L || !instance) return;

    if (customerLocation && isValidCoordinate(customerLocation.latitude, customerLocation.longitude)) {
      const point: LeafletNamespace.LatLngTuple = [
        customerLocation.latitude,
        customerLocation.longitude,
      ];
      if (!customerMarker.current) {
        customerMarker.current = L.marker(point, { title: "Delivery location" })
          .addTo(instance)
          .bindPopup("Delivery location");
      } else {
        customerMarker.current.setLatLng(point);
      }
    }

    if (driverLocation && isValidCoordinate(driverLocation.latitude, driverLocation.longitude)) {
      const point: LeafletNamespace.LatLngTuple = [
        driverLocation.latitude,
        driverLocation.longitude,
      ];
      if (!driverMarker.current) {
        driverMarker.current = L.marker(point, { title: "Driver" }).addTo(instance).bindPopup("Driver");
      } else {
        driverMarker.current.setLatLng(point);
      }
    }

    const points = [customerLocation, driverLocation]
      .filter((location): location is Coordinates =>
        Boolean(location && isValidCoordinate(location.latitude, location.longitude)),
      )
      .map((location) => [location.latitude, location.longitude] as LeafletNamespace.LatLngTuple);

    if (points.length > 1) {
      instance.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    } else if (points[0]) {
      instance.setView(points[0], Math.max(instance.getZoom(), 14));
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
      <div ref={mapElement} className="absolute inset-0 z-0" aria-label="Delivery map" />
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
  if (!isValidCoordinate(address.latitude, address.longitude)) return null;
  return { latitude: address.latitude, longitude: address.longitude };
}
