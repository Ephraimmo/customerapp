import { cn } from "@/lib/utils";

/*
 * Hearth brand mark.
 *
 * A hollow flame: the hearth fire, drawn as one closed path with the core cut
 * out so it holds its shape down to 16px and survives in a single colour.
 * Kept as inline SVG (not an <img>) so it inherits currentColor and recolours
 * per surface. The same geometry is mirrored in public/favicon.svg — change
 * both together.
 */
const FLAME_PATH =
  "M16 4C20.5 10 25 13.5 25 19A9 9 0 0 1 7 19C7 13.5 11.5 10 16 4Z" +
  "M16 13C18 16 20 17.8 20 20.5A4 4 0 0 1 12 20.5C12 17.8 14 16 16 13Z";

/** The flame on its own, in the current text colour. */
export function HearthMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={cn("size-6 shrink-0", className)}>
      <path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d={FLAME_PATH} />
    </svg>
  );
}

/** The flame in a filled tile — for hero, empty and error surfaces. */
export function HearthBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm",
        className,
      )}
    >
      <HearthMark className="size-2/3" />
    </span>
  );
}

/**
 * Mark plus wordmark. The name is real text, so it stays selectable and is
 * announced correctly; the flame is decorative.
 */
export function HearthLogo({
  className,
  wordmarkClassName,
  showWordmark = true,
}: {
  className?: string;
  wordmarkClassName?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <HearthMark className="size-6 text-primary" />
      {showWordmark ? (
        <span className={cn("text-lg leading-none font-black tracking-tight", wordmarkClassName)}>
          Hearth
        </span>
      ) : (
        <span className="sr-only">Hearth</span>
      )}
    </span>
  );
}
