/**
 * Keyless OpenStreetMap / Leaflet loader — platform map standard (see MAP_INTEGRATION_HANDOVER).
 * No API key, no billing, no referrer allowlist: the map always renders.
 */
import type * as LeafletNamespace from "leaflet";

export type Leaflet = typeof LeafletNamespace;

let leafletLoader: Promise<Leaflet> | null = null;

export function loadLeaflet(): Promise<Leaflet> {
  if (typeof window === "undefined") return Promise.reject(new Error("Maps require a browser"));
  if (leafletLoader) return leafletLoader;

  leafletLoader = (async () => {
    const [mod] = await Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]);
    const L = (mod.default ?? mod) as Leaflet;

    // Default marker icons 404 under bundlers — pin them to bundled assets once.
    const [iconUrl, iconRetinaUrl, shadowUrl] = await Promise.all([
      import("leaflet/dist/images/marker-icon.png"),
      import("leaflet/dist/images/marker-icon-2x.png"),
      import("leaflet/dist/images/marker-shadow.png"),
    ]);
    L.Marker.prototype.options.icon = L.icon({
      iconUrl: iconUrl.default as unknown as string,
      iconRetinaUrl: iconRetinaUrl.default as unknown as string,
      shadowUrl: shadowUrl.default as unknown as string,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });

    return L;
  })();

  return leafletLoader;
}

export const OSM_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_SATELLITE_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const OSM_ATTRIBUTION = "&copy; OpenStreetMap contributors";
export const SATELLITE_ATTRIBUTION = "Imagery &copy; Esri";

/** Coordinates are only usable when finite and inside real-world bounds. */
export function isValidCoordinate(latitude: unknown, longitude: unknown) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/** Keyless OSM single-pin embed URL. bbox order is lng,lat,lng,lat. */
export function osmEmbedSrc(latitude: number, longitude: number, span = 0.01) {
  const bbox = [longitude - span, latitude - span, longitude + span, latitude + span].join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude}%2C${longitude}`;
}
