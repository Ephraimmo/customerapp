import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/*
 * Shared presentation primitives for the cart → checkout flow.
 * Keeps both pages on one surface, spacing and typography scale.
 */

/** Shared surface for inputs, selects and textareas across the app. */
export const fieldClass =
  "w-full rounded-lg border border-border bg-secondary px-3.5 py-2.5 text-sm outline-none transition-shadow placeholder:text-muted-foreground/70 focus:border-primary/40 focus:ring-2 focus:ring-primary/20";

const STEPS = [
  { id: "cart", label: "Cart" },
  { id: "checkout", label: "Checkout" },
  { id: "track", label: "Track" },
] as const;

export type CheckoutStepId = (typeof STEPS)[number]["id"];

/** Cart → Checkout → Track rail, shown under the header on both pages. */
export function CheckoutProgress({
  current,
  className,
}: {
  current: CheckoutStepId;
  className?: string;
}) {
  const activeIndex = STEPS.findIndex((step) => step.id === current);

  return (
    <ol aria-label="Order progress" className={cn("flex items-center gap-2", className)}>
      {STEPS.map((step, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        const isLast = index === STEPS.length - 1;

        return (
          <li
            key={step.id}
            aria-current={active ? "step" : undefined}
            className={cn("flex items-center gap-2", !isLast && "flex-1")}
          >
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full font-mono text-[10px] leading-none font-black",
                active && "bg-primary text-primary-foreground",
                done && "bg-primary/15 text-primary",
                !active && !done && "bg-secondary text-muted-foreground ring-1 ring-border",
              )}
            >
              {done ? <Check className="size-3" strokeWidth={3} aria-hidden /> : index + 1}
            </span>
            <span
              className={cn(
                "text-[11px] font-bold whitespace-nowrap",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
            {!isLast ? (
              <span
                aria-hidden
                className={cn("h-px flex-1 rounded-full", done ? "bg-primary/40" : "bg-border")}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Single column page width, shared with ActionBar so the sticky bar lines up. */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-full bg-background sm:max-w-[640px] md:max-w-2xl">
      {children}
    </div>
  );
}

/** The one content surface used across both pages. */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card shadow-sm", className)}>
      {children}
    </div>
  );
}

/** Micro eyebrow above a panel, with an optional trailing action. */
export function SectionLabel({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-2.5 flex items-end justify-between gap-3 px-1", className)}>
      <h2 className="label-mono text-muted-foreground">{children}</h2>
      {action}
    </div>
  );
}

/** Numbered step heading for the checkout form. */
export function StepLabel({
  step,
  title,
  action,
}: {
  step: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3 px-1">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-secondary font-mono text-[10px] font-black text-muted-foreground ring-1 ring-border">
          {step}
        </span>
        <h2 className="truncate text-sm font-bold tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );
}

/** One label/value pair inside a stats strip. Render inside a <dl>. */
export function StatCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | undefined;
}) {
  return (
    <div className="min-w-0">
      <dt className="label-mono text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-1.5 truncate font-mono text-sm font-bold tabular-nums",
          tone === "positive" && "text-emerald-600 dark:text-emerald-400",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** One line of a price breakdown. Render inside a <dl>. */
export function SummaryRow({
  label,
  value,
  hint,
  positive,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
  positive?: boolean | undefined;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="flex min-w-0 items-baseline gap-1.5 text-muted-foreground">
        <span className="truncate">{label}</span>
        {hint ? (
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">{hint}</span>
        ) : null}
      </dt>
      <dd
        className={cn(
          "shrink-0 font-mono text-sm font-bold tabular-nums",
          positive ? "text-emerald-600 dark:text-emerald-400" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

const CALLOUT_TONES = {
  info: "border-primary/25 bg-primary/5 text-primary",
  success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  danger: "border-destructive/25 bg-destructive/10 text-destructive",
} as const;

/** Inline notice — out of range, missing address, EFT reminders. */
export function Callout({
  tone = "info",
  icon,
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof CALLOUT_TONES;
  icon?: ReactNode;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border p-3.5", CALLOUT_TONES[tone], className)}>
      <div className="flex items-start gap-2.5">
        {icon ? <span className="mt-px shrink-0">{icon}</span> : null}
        <div className="min-w-0 flex-1">
          {title ? <p className="text-xs font-bold">{title}</p> : null}
          {children ? (
            <div className={cn("text-xs leading-relaxed text-muted-foreground", title && "mt-1")}>
              {children}
            </div>
          ) : null}
          {action ? <div className="mt-2.5">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

/** Sticky bottom bar, width-matched to PageShell. */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur-md">
      <div className="mx-auto w-full max-w-full px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-[640px] md:max-w-2xl">
        {children}
      </div>
    </div>
  );
}

/** Total line that sits above the primary call to action. */
export function ActionBarTotal({ hint, value }: { hint: string; value: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <span className="min-w-0 truncate text-[11px] font-bold text-muted-foreground">{hint}</span>
      <span className="shrink-0 font-mono text-lg leading-none font-black tabular-nums">
        {value}
      </span>
    </div>
  );
}

/** Copyable key/value pair — bank details on the EFT panel. */
export function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      toast.error("Couldn't copy — please copy the value manually.");
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="label-mono shrink-0 text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-1">
        <span className="truncate font-mono text-[11px] font-bold">{value}</span>
        <button
          type="button"
          onClick={copyValue}
          aria-label={`Copy ${label}`}
          className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          {copied ? (
            <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}

/** Accessible confirmation modal — Escape and backdrop close, focus lands on confirm. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  icon,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "primary",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  icon: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "destructive";
}) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    const previousOverflow = document.body.style.overflow;
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const titleId = `confirm-${title.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-background/80 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="animate-[var(--animate-pop-in)] w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-2xl"
      >
        <div
          className={cn(
            "mx-auto grid size-12 place-items-center rounded-xl ring-1",
            tone === "destructive"
              ? "bg-destructive/10 text-destructive ring-destructive/20"
              : "bg-primary/10 text-primary ring-primary/20",
          )}
        >
          {icon}
        </div>

        <h3 id={titleId} className="mt-4 text-base font-black tracking-tight">
          {title}
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{description}</p>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-1 cursor-pointer rounded-xl border border-border bg-secondary text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className={cn(
              "h-11 flex-1 cursor-pointer rounded-xl text-xs font-black tracking-wider uppercase shadow-sm transition-colors",
              tone === "destructive"
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
