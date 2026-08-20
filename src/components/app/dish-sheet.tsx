import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Minus, Plus, Store, X } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart";
import { getRestaurant, money, type Dish } from "@/lib/data";
import { RestaurantConflictDialog } from "./restaurant-conflict-dialog";

export function DishSheet({
  dish,
  restaurantSlug,
  onClose,
}: {
  dish: Dish;
  restaurantSlug: string;
  onClose: () => void;
}) {
  const {
    lines,
    hasConflict,
    addLine,
    clearAndAddLine,
    currentRestaurantName,
    itemCount,
    subtotal,
  } = useCart();

  const [sizeId, setSizeId] = useState(dish.sizes[0]?.id ?? "regular");
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState(1);
  const [showConflictDialog, setShowConflictDialog] = useState(false);

  const targetRestaurant = useMemo(() => getRestaurant(restaurantSlug), [restaurantSlug]);
  const targetRestaurantName = targetRestaurant?.name || restaurantSlug;

  const isConflict = hasConflict(restaurantSlug);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showConflictDialog) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, showConflictDialog]);

  const size = dish.sizes.find((s) => s.id === sizeId) ?? dish.sizes[0];
  const extrasTotal = dish.extras
    .filter((e) => extraIds.includes(e.id))
    .reduce((sum, e) => sum + e.price, 0);
  const unit = dish.price + (size?.delta ?? 0) + extrasTotal;

  function toggle(list: string[], id: string) {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  function submit() {
    const input = {
      dish,
      restaurantSlug,
      sizeId,
      extraIds,
      removed,
      notes: notes.trim(),
      qty,
    };

    // If there is an existing cart from another restaurant, show conflict confirmation popup
    if (isConflict) {
      setShowConflictDialog(true);
      return;
    }

    const result = addLine(input);
    if (!result.success && result.conflict) {
      setShowConflictDialog(true);
      return;
    }

    toast.success(`${qty}× ${dish.name} added`, {
      description: money(unit * qty),
    });
    onClose();
  }

  function handleConfirmReplace() {
    clearAndAddLine({
      dish,
      restaurantSlug,
      sizeId,
      extraIds,
      removed,
      notes: notes.trim(),
      qty,
    });
    setShowConflictDialog(false);
    toast.success(`${qty}× ${dish.name} added`, {
      description: `Cart cleared. Started new order from ${targetRestaurantName}.`,
    });
    onClose();
  }

  function handleCancelReplace() {
    setShowConflictDialog(false);
    toast.info(`Cart kept with items from ${currentRestaurantName || "current restaurant"}`);
  }

  return (
    <>
      <div className="fixed inset-0 z-60 flex items-end justify-center">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        />
        <div
          role="dialog"
          aria-label={`Customize ${dish.name}`}
          className="relative flex max-h-[92vh] w-full max-w-md animate-[var(--animate-sheet-up)] flex-col overflow-hidden rounded-t-[32px] bg-background shadow-2xl"
        >
          <div className="relative">
            <img
              src={dish.image}
              alt={dish.name}
              width={1024}
              height={640}
              className="aspect-[16/9] w-full object-cover"
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close customization"
              className="absolute top-4 right-4 grid size-11 place-items-center rounded-full bg-background/90 ring-1 ring-border backdrop-blur cursor-pointer hover:bg-background transition-colors"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto px-5 pt-5 pb-40">
            {/* Friendly conflict reminder banner if user currently has items from another kitchen */}
            {isConflict && (
              <div className="rounded-2xl bg-amber-500/10 p-3.5 border border-amber-500/25 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
                <AlertCircle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <p className="font-bold">
                    Ordering from {targetRestaurantName}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Your cart contains items from <strong>{currentRestaurantName}</strong>. Adding this will give you the option to clear your cart and switch kitchens.
                  </p>
                </div>
              </div>
            )}

            <div>
              <h2 className="text-2xl leading-tight font-black tracking-tight">{dish.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{dish.description}</p>
              <p className="label-mono mt-3 text-muted-foreground">
                {dish.calories} kcal • {dish.prepMinutes} min
                {dish.allergens.length ? ` • Allergens: ${dish.allergens.join(", ")}` : ""}
              </p>
            </div>

            <section>
              <h3 className="label-mono mb-3 text-muted-foreground">Choose size</h3>
              <div className="grid grid-cols-2 gap-2">
                {dish.sizes.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSizeId(s.id)}
                    className={`flex h-12 items-center justify-between rounded-2xl px-4 text-sm font-bold ring-1 transition-colors cursor-pointer ${
                      sizeId === s.id
                        ? "bg-primary/10 text-primary ring-primary/30"
                        : "bg-secondary ring-border hover:bg-secondary/80"
                    }`}
                  >
                    {s.label}
                    <span className="font-mono text-xs">
                      {s.delta === 0 ? "—" : `${s.delta > 0 ? "+" : "-"}${money(Math.abs(s.delta))}`}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {dish.extras.length ? (
              <section>
                <h3 className="label-mono mb-3 text-muted-foreground">Add extras (optional)</h3>
                <div className="space-y-2">
                  {dish.extras.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setExtraIds((prev) => toggle(prev, e.id))}
                      aria-pressed={extraIds.includes(e.id)}
                      className={`flex h-12 w-full items-center justify-between rounded-2xl px-4 text-sm font-semibold ring-1 transition-colors cursor-pointer ${
                        extraIds.includes(e.id)
                          ? "bg-primary/10 text-primary ring-primary/30"
                          : "bg-secondary ring-border hover:bg-secondary/80"
                      }`}
                    >
                      {e.label}
                      <span className="font-mono text-xs">+{money(e.price)}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {dish.ingredients.length ? (
              <section>
                <h3 className="label-mono mb-3 text-muted-foreground">
                  Remove ingredients (optional)
                </h3>
                <div className="flex flex-wrap gap-2">
                  {dish.ingredients.map((ing) => (
                    <button
                      key={ing}
                      type="button"
                      onClick={() => setRemoved((prev) => toggle(prev, ing))}
                      aria-pressed={removed.includes(ing)}
                      className={`rounded-full px-4 py-2 text-xs font-bold ring-1 transition-colors cursor-pointer ${
                        removed.includes(ing)
                          ? "bg-destructive/10 text-destructive line-through ring-destructive/30"
                          : "bg-secondary ring-border hover:bg-secondary/80"
                      }`}
                    >
                      {ing}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="dish-notes" className="label-mono block text-muted-foreground">
                  Special instructions{" "}
                  <span className="text-xs opacity-70 font-normal">(Optional)</span>
                </label>
                <span className="text-[11px] text-muted-foreground">{notes.length}/200</span>
              </div>
              <textarea
                id="dish-notes"
                value={notes}
                maxLength={200}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="e.g. Extra sauce on the side, well done, cut into quarters..."
                className="w-full resize-none rounded-2xl bg-secondary px-4 py-3 text-sm ring-1 ring-border outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-primary/30"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Optional requests for the chef. Leave empty if you have no preferences.
              </p>
            </section>
          </div>

          <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 border-t border-border bg-background/95 px-5 pt-4 pb-7 backdrop-blur">
            <div className="flex h-14 items-center gap-1 rounded-2xl bg-secondary px-2 ring-1 ring-border">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="grid size-10 place-items-center rounded-xl cursor-pointer hover:bg-background transition-colors"
              >
                <Minus className="size-4" aria-hidden />
              </button>
              <span className="w-6 text-center font-mono font-bold">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(20, q + 1))}
                aria-label="Increase quantity"
                className="grid size-10 place-items-center rounded-xl cursor-pointer hover:bg-background transition-colors"
              >
                <Plus className="size-4" aria-hidden />
              </button>
            </div>
            <button
              type="button"
              onClick={submit}
              className="flex h-14 flex-1 items-center justify-between rounded-2xl bg-primary px-5 text-primary-foreground shadow-xl shadow-primary/30 transition-transform active:scale-[0.98] cursor-pointer hover:bg-primary/95"
            >
              <span className="text-sm font-black tracking-[0.1em] uppercase">
                {isConflict ? "Start new cart" : "Add to cart"}
              </span>
              <span className="font-mono font-bold">{money(unit * qty)}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Pop-up dialog asking user if they want to clear cart & start new restaurant order */}
      <RestaurantConflictDialog
        open={showConflictDialog}
        onClose={handleCancelReplace}
        onConfirm={handleConfirmReplace}
        currentRestaurantName={currentRestaurantName || "Current Kitchen"}
        currentRestaurantSlug={lines[0]?.restaurantSlug}
        currentItemsCount={itemCount}
        currentSubtotal={subtotal}
        currentItemsSummary={lines.map((l) => `${l.qty}× ${l.name}`)}
        newRestaurantName={targetRestaurantName}
        newDishName={dish.name}
        newDishImage={dish.image}
        newDishQty={qty}
        newDishPrice={unit * qty}
      />
    </>
  );
}
