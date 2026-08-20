import { useState } from "react";

/**
 * Lazy image with a placeholder for Firebase-hosted assets that may be
 * missing or slow. Never renders a broken image.
 */
export function LiveImage({
  src,
  alt,
  className = "",
  priority = false,
  width = 1024,
  height = 640,
}: {
  src: string | undefined;
  alt: string;
  className?: string;
  priority?: boolean;
  width?: number;
  height?: number;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const usable = !!src && !failed;

  if (!usable) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`bg-gradient-to-br from-secondary to-muted ${className}`}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
      className={`${className} ${loaded ? "opacity-100" : "opacity-0"} transition-opacity duration-300`}
    />
  );
}
