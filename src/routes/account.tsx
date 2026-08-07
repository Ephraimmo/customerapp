import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Gift, Heart, LogIn, LogOut, MapPin, Wallet } from "lucide-react";
import { toast } from "sonner";
import { BottomNav } from "@/components/app/bottom-nav";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/data";
import { useRestaurants } from "@/lib/firebase-adapters";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Your account — Hearth" },
      {
        name: "description",
        content: "Manage addresses, wallet balance, loyalty points and favourite restaurants.",
      },
      { property: "og:title", content: "Your account — Hearth" },
      {
        property: "og:description",
        content: "Addresses, wallet, loyalty and favourites in one place.",
      },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { restaurants } = useRestaurants();
  const { orders } = useCart();
  const { user, signOut } = useAuth();
  const spent = orders.reduce((sum, o) => sum + o.total, 0);

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-background md:max-w-2xl">
      <header className="border-b border-border px-4 pt-6 pb-6">
        <div className="flex items-center gap-4">
          <span className="grid size-16 place-items-center rounded-3xl bg-secondary text-lg font-black ring-1 ring-border">
            {user ? user.initials : "GU"}
          </span>
          <div>
            <h1 className="text-xl leading-tight font-black tracking-tight">
              {user ? user.name : "Guest"}
            </h1>
            <p className="label-mono mt-1 text-muted-foreground">
              {user ? user.email : "Not signed in"}
            </p>
          </div>
        </div>
        {user ? (
          <button
            type="button"
            onClick={() => {
              signOut();
              toast("Signed out", { description: "Your cart stays saved to your account." });
            }}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-secondary text-sm font-black tracking-[0.1em] uppercase ring-1 ring-border"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        ) : (
          <Link
            to="/login"
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-black tracking-[0.1em] text-primary-foreground uppercase"
          >
            <LogIn className="size-4" aria-hidden />
            Sign in
          </Link>
        )}
        <div className="mt-6 grid grid-cols-3 gap-2">
          <Stat label="Orders" value={String(orders.length)} />
          <Stat label="Spent" value={money(spent)} />
          <Stat label="Points" value={String(Math.round(spent * 4))} />
        </div>
      </header>

      <main className="space-y-8 px-4 pt-6 pb-44 md:pb-24">
        <section className="rounded-3xl bg-foreground p-6 text-background">
          <span className="label-mono opacity-60">Hearth wallet</span>
          <p className="mt-1 font-mono text-3xl font-black">£18.40</p>
          <p className="mt-2 text-xs opacity-60">Cashback and refund credits apply automatically.</p>
        </section>

        <section>
          <h2 className="label-mono mb-3 text-muted-foreground">Saved addresses</h2>
          <div className="space-y-2">
            {[
              { label: "Home", value: "242 High Street, St. Ives" },
              { label: "Work", value: "Unit 4, Anchor Works, Harbour Rd" },
            ].map((a) => (
              <div
                key={a.label}
                className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3 ring-1 ring-border"
              >
                <MapPin className="size-4 text-primary" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="label-mono block text-muted-foreground">{a.label}</span>
                  <span className="block truncate text-sm font-bold">{a.value}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="label-mono mb-3 text-muted-foreground">Favourite restaurants</h2>
          <div className="space-y-2">
            {restaurants.slice(0, 3).map((r) => (
              <Link
                key={r.slug}
                to="/restaurant/$slug"
                params={{ slug: r.slug }}
                className="flex items-center gap-3 rounded-2xl bg-secondary p-3 ring-1 ring-border"
              >
                <img
                  src={r.image}
                  alt={r.name}
                  width={1024}
                  height={640}
                  loading="lazy"
                  className="size-12 rounded-xl object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{r.name}</span>
                  <span className="label-mono block text-muted-foreground">{r.tagline}</span>
                </span>
                <Heart className="size-4 fill-primary text-primary" aria-hidden />
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="label-mono mb-3 text-muted-foreground">More</h2>
          <div className="divide-y divide-border overflow-hidden rounded-2xl bg-secondary ring-1 ring-border">
            {[
              { label: "Loyalty & rewards", icon: Gift },
              { label: "Payment methods", icon: Wallet },
              { label: "Referral code — AMARA20", icon: Gift },
            ].map(({ label, icon: Icon }) => (
              <button
                key={label}
                type="button"
                className="flex h-14 w-full items-center gap-3 px-4 text-sm font-bold"
              >
                <Icon className="size-4 text-primary" aria-hidden />
                <span className="flex-1 text-left">{label}</span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </button>
            ))}
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-secondary p-3 ring-1 ring-border">
      <p className="font-mono text-sm font-black">{value}</p>
      <p className="label-mono text-muted-foreground">{label}</p>
    </div>
  );
}
