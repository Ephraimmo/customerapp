import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, ChevronDown, Check, Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart";
import { getRestaurant, money, type Dish } from "@/lib/data";
import { RestaurantConflictDialog } from "./restaurant-conflict-dialog";

/** Section wrapper. The numbered chip plus the required/optional pill are what
 *  tell someone at a glance how many decisions are left before checkout. */
function OptionSection({
  step,
  title,
  hint,
  required,
  children,
}: {
  step: number;
  title: string;
  hint: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-foreground font-mono text-[10px] font-black text-background">
            {step}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm leading-tight font-black tracking-tight">{title}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black tracking-widest uppercase ${
            required
              ? "bg-primary/12 text-primary ring-1 ring-primary/25"
              : "bg-secondary text-muted-foreground ring-1 ring-border"
          }`}
        >
          {required ? "Required" : "Optional"}
        </span>
      </div>
      {children}
    </section>
  );
}

/** Radio (single-choice) or checkbox (multi-choice) indicator. The shape is the
 *  signal: a circle means "swap", a square means "add as many as you like". */
function Selector({ shape, checked }: { shape: "radio" | "checkbox"; checked: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid size-5 shrink-0 place-items-center border-2 transition-colors ${
        shape === "radio" ? "rounded-full" : "rounded-[6px]"
      } ${checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"}`}
    >
      {checked ? (
        shape === "radio" ? (
          <span className="size-1.5 rounded-full bg-primary-foreground" />
        ) : (
          <Check className="size-3.5" strokeWidth={3.5} />
        )
      ) : null}
    </span>
  );
}

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
  const [atBottom, setAtBottom] = useState(true);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

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

  // Stop the menu behind the sheet from scrolling under the user's finger.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Drives the "more below" cue — without it the footer reads as the end of
  // the sheet and the remaining options go unnoticed.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 24);
    };
    update();

    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  const size = dish.sizes.find((s) => s.id === sizeId) ?? dish.sizes[0];
  const selectedExtras = dish.extras.filter((e) => extraIds.includes(e.id));
  const extrasTotal = selectedExtras.reduce((sum, e) => sum + e.price, 0);
  const unit = dish.price + (size?.delta ?? 0) + extrasTotal;

  const hasSizes = dish.sizes.length > 1;
  const hasExtras = dish.extras.length > 0;
  const hasIngredients = dish.ingredients.length > 0;

  // Numbered so someone can see how many decisions the dish actually asks for.
  let step = 0;
  const sizeStep = hasSizes ? ++step : 0;
  const extrasStep = hasExtras ? ++step : 0;
  const removeStep = hasIngredients ? ++step : 0;
  const notesStep = ++step;

  function toggle(list: string[], id: string) {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  function scrollToOptions() {
    scrollRef.current?.scrollBy({ top: scrollRef.current.clientHeight * 0.8, behavior: "smooth" });
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
      <div className="fixed inset-0 z-60 flex items-end justify-center sm:items-center sm:p-6">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute inset-0 bg-foreground/50 backdrop-blur-sm"
        />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Customize ${dish.name}`}
          tabIndex={-1}
          className="relative flex max-h-[92dvh] w-full max-w-md animate-[var(--animate-sheet-up)] flex-col overflow-hidden rounded-t-[32px] bg-background shadow-2xl outline-none sm:max-h-[86dvh] sm:rounded-[32px]"
        >
          {/* Capped by viewport height so the cover never crowds the options
              out of view on a short screen. */}
          <div className="relative shrink-0">
            <img
              src={dish.image}
              alt={dish.name}
              width={1024}
              height={640}
              className="aspect-[16/9] max-h-[22dvh] w-full object-cover sm:max-h-[min(13rem,25dvh)]"
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close customization"
              className="absolute top-4 right-4 grid size-11 cursor-pointer place-items-center rounded-full bg-background/90 shadow-sm ring-1 ring-border backdrop-blur transition-colors hover:bg-background"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <div ref={scrollRef} className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-6 px-5 pt-5 pb-6">
              {/* Friendly conflict reminder banner if user currently has items from another kitchen */}
              {isConflict && (
                <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:text-amber-300">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="leading-relaxed">
                    <p className="font-bold">Ordering from {targetRestaurantName}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Your cart contains items from <strong>{currentRestaurantName}</strong>. Adding
                      this will give you the option to clear your cart and switch kitchens.
                    </p>
                  </div>
                </div>
              )}

              <div>
                <h2 className="text-2xl leading-tight font-black tracking-tight">{dish.name}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {dish.description}
                </p>
                <p className="label-mono mt-3 text-muted-foreground">
                  {dish.calories} kcal • {dish.prepMinutes} min
                  {dish.allergens.length ? ` • Allergens: ${dish.allergens.join(", ")}` : ""}
                </p>
                <p className="mt-3 flex items-baseline gap-2">
                  <span className="font-mono text-lg font-black">{money(dish.price)}</span>
                  <span className="label-mono text-muted-foreground">base price</span>
                </p>
              </div>

              <div className="h-px bg-border" />

              {hasSizes ? (
                <OptionSection
                  step={sizeStep}
                  title="Choose a size"
                  hint="Pick one — this swaps the base price."
                  required
                >
                  <div
                    role="radiogroup"
                    aria-label="Choose a size"
                    className="grid grid-cols-1 gap-2"
                  >
                    {dish.sizes.map((s) => {
                      const checked = sizeId === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          role="radio"
                          aria-checked={checked}
                          onClick={() => setSizeId(s.id)}
                          className={`flex min-h-13 w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${
                            checked
                              ? "bg-primary/10 ring-2 ring-primary"
                              : "bg-secondary ring-1 ring-border hover:bg-secondary/70"
                          }`}
                        >
                          <Selector shape="radio" checked={checked} />
                          <span className="min-w-0 flex-1 text-sm leading-snug font-bold">
                            {s.label}
                          </span>
                          <span
                            className={`shrink-0 font-mono text-xs font-bold whitespace-nowrap ${
                              s.delta === 0 ? "text-muted-foreground" : "text-foreground"
                            }`}
                          >
                            {s.delta === 0
                              ? "Included"
                              : `${s.delta > 0 ? "+" : "−"}${money(Math.abs(s.delta))}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </OptionSection>
              ) : null}

              {hasExtras ? (
                <OptionSection
                  step={extrasStep}
                  title="Add extras"
                  hint="Tick as many as you like — each one adds to the price."
                >
                  <div className="space-y-2">
                    {dish.extras.map((e) => {
                      const checked = extraIds.includes(e.id);
                      return (
                        <button
                          key={e.id}
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          onClick={() => setExtraIds((prev) => toggle(prev, e.id))}
                          className={`flex min-h-13 w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${
                            checked
                              ? "bg-primary/10 ring-2 ring-primary"
                              : "bg-secondary ring-1 ring-border hover:bg-secondary/70"
                          }`}
                        >
                          <Selector shape="checkbox" checked={checked} />
                          <span className="min-w-0 flex-1 text-sm leading-snug font-semibold">
                            {e.label}
                          </span>
                          <span className="shrink-0 font-mono text-xs font-bold whitespace-nowrap">
                            +{money(e.price)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </OptionSection>
              ) : null}

              {hasIngredients ? (
                <OptionSection
                  step={removeStep}
                  title="Remove ingredients"
                  hint="Tap anything you'd rather leave out. No price change."
                >
                  <div className="flex flex-wrap gap-2">
                    {dish.ingredients.map((ing) => {
                      const checked = removed.includes(ing);
                      return (
                        <button
                          key={ing}
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          onClick={() => setRemoved((prev) => toggle(prev, ing))}
                          className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition-colors ${
                            checked
                              ? "bg-destructive/10 text-destructive line-through ring-2 ring-destructive/40"
                              : "bg-secondary ring-1 ring-border hover:bg-secondary/70"
                          }`}
                        >
                          {checked ? <X className="size-3" strokeWidth={3} aria-hidden /> : null}
                          {ing}
                        </button>
                      );
                    })}
                  </div>
                  {removed.length ? (
                    <p className="mt-2 text-xs text-destructive">
                      Leaving out: {removed.join(", ")}
                    </p>
                  ) : null}
                </OptionSection>
              ) : null}

              <OptionSection
                step={notesStep}
                title="Special instructions"
                hint="Anything the chef should know? Leave blank if not."
              >
                <textarea
                  id="dish-notes"
                  value={notes}
                  maxLength={200}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="e.g. Extra sauce on the side, well done, cut into quarters..."
                  className="w-full resize-none rounded-2xl bg-secondary px-4 py-3 text-sm ring-1 ring-border outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-primary/40"
                />
                <p className="mt-1 text-right text-[11px] text-muted-foreground">
                  {notes.length}/200
                </p>
              </OptionSection>
            </div>
          </div>

          <div className="relative shrink-0 border-t border-border bg-background px-5 pt-3 pb-7">
            {/* Fade + jump button: the footer used to look like the end of the
                sheet, hiding every option below the fold. */}
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-x-0 -top-16 h-16 bg-gradient-to-t from-background via-background/85 to-transparent transition-opacity duration-200 ${
                atBottom ? "opacity-0" : "opacity-100"
              }`}
            />
            {!atBottom ? (
              <button
                type="button"
                onClick={scrollToOptions}
                className="absolute -top-12 left-1/2 flex h-9 -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full bg-foreground px-4 text-[10px] font-black tracking-widest text-background uppercase shadow-lg transition-transform hover:scale-105"
              >
                More options
                <ChevronDown className="size-3.5" strokeWidth={3} aria-hidden />
              </button>
            ) : null}

            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">
                  {[hasSizes ? size?.label : null, ...selectedExtras.map((e) => e.label)]
                    .filter(Boolean)
                    .join(" · ") || dish.name}
                </p>
                {qty > 1 ? (
                  <p className="label-mono mt-1 text-muted-foreground">{money(unit)} each</p>
                ) : null}
              </div>

              <div className="flex h-12 shrink-0 items-center rounded-2xl bg-secondary px-1 ring-1 ring-border">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={qty <= 1}
                  aria-label="Decrease quantity"
                  className="grid size-10 cursor-pointer place-items-center rounded-xl transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <Minus className="size-4" aria-hidden />
                </button>
                <span
                  aria-live="polite"
                  className="w-7 text-center font-mono font-bold tabular-nums"
                >
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.min(20, q + 1))}
                  disabled={qty >= 20}
                  aria-label="Increase quantity"
                  className="grid size-10 cursor-pointer place-items-center rounded-xl transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <Plus className="size-4" aria-hidden />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={submit}
              className="flex h-14 w-full cursor-pointer items-center justify-between gap-3 rounded-2xl bg-primary px-5 text-primary-foreground shadow-xl shadow-primary/30 transition-transform hover:bg-primary/95 active:scale-[0.98]"
            >
              <span className="text-sm font-black tracking-wider whitespace-nowrap uppercase">
                {isConflict ? "Start new cart" : "Add to cart"}
              </span>
              <span className="font-mono font-bold tabular-nums whitespace-nowrap">
                {money(unit * qty)}
              </span>
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
