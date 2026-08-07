import { useEffect, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart";
import { money, type Dish } from "@/lib/data";

export function DishSheet({
  dish,
  restaurantSlug,
  onClose,
}: {
  dish: Dish;
  restaurantSlug: string;
  onClose: () => void;
}) {
  const { addLine } = useCart();
  const [sizeId, setSizeId] = useState(dish.sizes[0]?.id ?? "regular");
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState(1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const size = dish.sizes.find((s) => s.id === sizeId) ?? dish.sizes[0];
  const extrasTotal = dish.extras
    .filter((e) => extraIds.includes(e.id))
    .reduce((sum, e) => sum + e.price, 0);
  const unit = dish.price + (size?.delta ?? 0) + extrasTotal;

  function toggle(list: string[], id: string) {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  function submit() {
    const { replaced } = addLine({
      dish,
      restaurantSlug,
      sizeId,
      extraIds,
      removed,
      notes: notes.trim(),
      qty,
    });
    toast.success(`${qty}× ${dish.name} added`, {
      description: replaced ? "Cart cleared — items from a new restaurant." : money(unit * qty),
    });
    onClose();
  }

  return (
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
        className="relative flex max-h-[92vh] w-full max-w-md animate-[var(--animate-sheet-up)] flex-col overflow-hidden rounded-t-[32px] bg-background"
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
            className="absolute top-4 right-4 grid size-11 place-items-center rounded-full bg-background/90 ring-1 ring-border backdrop-blur"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-7 overflow-y-auto px-5 pt-5 pb-40">
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
                  className={`flex h-12 items-center justify-between rounded-2xl px-4 text-sm font-bold ring-1 transition-colors ${
                    sizeId === s.id
                      ? "bg-primary/10 text-primary ring-primary/30"
                      : "bg-secondary ring-border"
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
              <h3 className="label-mono mb-3 text-muted-foreground">Add extras</h3>
              <div className="space-y-2">
                {dish.extras.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setExtraIds((prev) => toggle(prev, e.id))}
                    aria-pressed={extraIds.includes(e.id)}
                    className={`flex h-12 w-full items-center justify-between rounded-2xl px-4 text-sm font-semibold ring-1 transition-colors ${
                      extraIds.includes(e.id)
                        ? "bg-primary/10 text-primary ring-primary/30"
                        : "bg-secondary ring-border"
                    }`}
                  >
                    {e.label}
                    <span className="font-mono text-xs">+{money(e.price)}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <h3 className="label-mono mb-3 text-muted-foreground">Remove ingredients</h3>
            <div className="flex flex-wrap gap-2">
              {dish.ingredients.map((ing) => (
                <button
                  key={ing}
                  type="button"
                  onClick={() => setRemoved((prev) => toggle(prev, ing))}
                  aria-pressed={removed.includes(ing)}
                  className={`rounded-full px-4 py-2 text-xs font-bold ring-1 transition-colors ${
                    removed.includes(ing)
                      ? "bg-destructive/10 text-destructive line-through ring-destructive/30"
                      : "bg-secondary ring-border"
                  }`}
                >
                  {ing}
                </button>
              ))}
            </div>
          </section>

          <section>
            <label htmlFor="dish-notes" className="label-mono mb-3 block text-muted-foreground">
              Special instructions
            </label>
            <textarea
              id="dish-notes"
              value={notes}
              maxLength={200}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Extra crispy, no coriander…"
              className="w-full resize-none rounded-2xl bg-secondary px-4 py-3 text-sm ring-1 ring-border outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
            />
          </section>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 border-t border-border bg-background/95 px-5 pt-4 pb-7 backdrop-blur">
          <div className="flex h-14 items-center gap-1 rounded-2xl bg-secondary px-2 ring-1 ring-border">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              aria-label="Decrease quantity"
              className="grid size-10 place-items-center rounded-xl"
            >
              <Minus className="size-4" aria-hidden />
            </button>
            <span className="w-6 text-center font-mono font-bold">{qty}</span>
            <button
              type="button"
              onClick={() => setQty((q) => Math.min(20, q + 1))}
              aria-label="Increase quantity"
              className="grid size-10 place-items-center rounded-xl"
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </div>
          <button
            type="button"
            onClick={submit}
            className="flex h-14 flex-1 items-center justify-between rounded-2xl bg-primary px-5 text-primary-foreground shadow-xl shadow-primary/30 transition-transform active:scale-[0.98]"
          >
            <span className="text-sm font-black tracking-[0.1em] uppercase">Add to cart</span>
            <span className="font-mono font-bold">{money(unit * qty)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
