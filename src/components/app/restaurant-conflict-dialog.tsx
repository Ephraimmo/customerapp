import { useEffect } from "react";
import { AlertTriangle, ArrowDown, Check, Store, Trash2, UtensilsCrossed, X } from "lucide-react";
import { money } from "@/lib/data";

export interface RestaurantConflictDialogProps {
  open: boolean;
  onClose: () => void; // Cancel -> returns and does NOT modify the cart
  onConfirm: () => void; // Yes -> clears cart and adds current item
  currentRestaurantName: string;
  currentRestaurantSlug?: string | null | undefined;
  currentItemsCount: number;
  currentSubtotal: number;
  currentItemsSummary?: string[] | undefined;
  newRestaurantName: string;
  newDishName?: string | undefined;
  newDishImage?: string | undefined;
  newDishQty?: number | undefined;
  newDishPrice?: number | undefined;
}

export function RestaurantConflictDialog({
  open,
  onClose,
  onConfirm,
  currentRestaurantName,
  currentItemsCount,
  currentSubtotal,
  currentItemsSummary = [],
  newRestaurantName,
  newDishName,
  newDishImage,
  newDishQty = 1,
  newDishPrice = 0,
}: RestaurantConflictDialogProps) {
  // ESC key cancels cleanly without touching the cart
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-dialog-title"
      aria-describedby="conflict-dialog-desc"
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-[var(--animate-sheet-up)]"
    >
      {/* Click outside to cancel and keep cart untouched */}
      <button
        type="button"
        aria-label="Cancel and keep current cart"
        onClick={onClose}
        className="absolute inset-0 cursor-default focus:outline-none"
      />

      <div className="relative w-full max-w-md rounded-[32px] bg-card p-6 sm:p-7 border border-border/80 shadow-2xl space-y-5 text-left z-10 overflow-hidden">
        {/* Header with Dual-Tone Icon Badge and Close Button */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <div className="grid size-12 place-items-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30 shrink-0">
              <UtensilsCrossed className="size-6" />
            </div>
            <div className="min-w-0">
              <span className="label-mono text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400 tracking-widest block">
                Switch Kitchens?
              </span>
              <h2
                id="conflict-dialog-title"
                className="text-lg sm:text-xl font-black tracking-tight text-foreground leading-tight truncate mt-0.5"
              >
                Ordering from {newRestaurantName}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel and close dialog"
            className="grid size-9 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-foreground cursor-pointer transition-colors shrink-0"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Primary Notification Message */}
        <div className="rounded-2xl bg-secondary/60 p-4 border border-border/70 space-y-2">
          <p id="conflict-dialog-desc" className="text-xs sm:text-sm text-foreground/90 leading-relaxed">
            Your cart contains items from{" "}
            <strong className="font-black text-foreground">{currentRestaurantName}</strong>. Adding
            this will give you the option to clear your cart and switch kitchens.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Each order is freshly prepared and fulfilled by a single restaurant kitchen at a time.
          </p>
        </div>

        {/* Visual Cart Comparison Breakdown */}
        <div className="space-y-2">
          {/* Current Cart Box */}
          <div className="rounded-2xl bg-background/80 p-3.5 border border-border/70">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-bold text-foreground min-w-0">
                <Store className="size-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{currentRestaurantName}</span>
              </div>
              <span className="font-mono font-bold text-muted-foreground shrink-0 ml-2">
                {money(currentSubtotal)}
              </span>
            </div>

            <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {currentItemsCount} {currentItemsCount === 1 ? "item" : "items"} currently in cart
              </span>
              <span className="text-destructive text-[10px] font-bold flex items-center gap-1">
                <Trash2 className="size-3" />
                Will be cleared
              </span>
            </div>

            {currentItemsSummary.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {currentItemsSummary.slice(0, 3).map((item, idx) => (
                  <span
                    key={idx}
                    className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground truncate max-w-[200px]"
                  >
                    {item}
                  </span>
                ))}
                {currentItemsSummary.length > 3 && (
                  <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    +{currentItemsSummary.length - 3} more
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Replacement Indicator Arrow */}
          <div className="flex items-center justify-center -my-1 py-1">
            <div className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-0.5 text-[10px] font-bold text-muted-foreground border border-border shadow-xs">
              <ArrowDown className="size-3 text-primary" />
              <span>Replace with new kitchen order</span>
            </div>
          </div>

          {/* New Item / Kitchen Box */}
          <div className="rounded-2xl bg-primary/5 p-3.5 border border-primary/25">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-bold text-primary min-w-0">
                <Store className="size-3.5 shrink-0" />
                <span className="truncate">{newRestaurantName}</span>
              </div>
              {newDishPrice > 0 && (
                <span className="font-mono font-bold text-primary shrink-0 ml-2">
                  {money(newDishPrice)}
                </span>
              )}
            </div>

            {newDishName && (
              <div className="mt-2 flex items-center gap-2.5">
                {newDishImage ? (
                  <img
                    src={newDishImage}
                    alt={newDishName}
                    className="size-11 rounded-xl object-cover ring-1 ring-border shrink-0"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-foreground truncate">
                    {newDishQty > 1 ? `${newDishQty}× ` : ""}
                    {newDishName}
                  </p>
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 mt-0.5">
                    <Check className="size-3" />
                    New order will start with this item
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons: Yes and Cancel */}
        <div className="pt-2 flex flex-col-reverse sm:flex-row gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-13 rounded-2xl bg-secondary text-xs sm:text-sm font-bold text-foreground hover:bg-secondary/80 border border-border cursor-pointer transition-all active:scale-[0.98]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 h-13 rounded-2xl bg-primary text-xs sm:text-sm font-black uppercase tracking-wider text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 active:scale-[0.98] transition-all cursor-pointer inline-flex items-center justify-center gap-2"
          >
            <span>Yes, Clear & Add</span>
          </button>
        </div>
      </div>
    </div>
  );
}
