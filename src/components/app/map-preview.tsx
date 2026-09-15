import { MapPin } from "lucide-react";
import { isValidCoordinate, osmEmbedSrc } from "@/lib/osm-map";

interface MapPreviewProps {
  latitude?: number | string | null;
  longitude?: number | string | null;
  title?: string;
  className?: string;
  emptyMessage?: string;
  /** Half-span of the viewport in degrees — smaller is more zoomed in. */
  span?: number;
}

/**
 * Shared single-pin map. Keyless OpenStreetMap embed, so it renders everywhere
 * with no API key. Renders a friendly fallback when coordinates are missing.
 */
export function MapPreview({
  latitude,
  longitude,
  title = "Location map",
  className = "h-[220px] w-full",
  emptyMessage = "No pinned location for this address yet.",
  span,
}: MapPreviewProps) {
  if (!isValidCoordinate(latitude, longitude)) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 bg-secondary px-6 text-center ${className}`}
      >
        <MapPin className="size-6 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <iframe
      title={title}
      src={osmEmbedSrc(Number(latitude), Number(longitude), span)}
      className={`border-0 ${className}`}
      loading="lazy"
    />
  );
}
