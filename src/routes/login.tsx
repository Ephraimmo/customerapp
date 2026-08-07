import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, LogIn } from "lucide-react";
import { toast } from "sonner";
import { demoAccounts, useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Hearth" },
      {
        name: "description",
        content: "Sign in to Hearth to keep your cart, addresses and orders saved to your account.",
      },
      { property: "og:title", content: "Sign in — Hearth" },
      {
        property: "og:description",
        content: "Your cart follows your account, so it's waiting when you come back.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { signIn, user, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = signIn(email, password);
    if (!result.ok) {
      setError(result.error ?? "Sign in failed.");
      return;
    }
    setError(null);
    toast.success("Signed in", { description: "Your saved cart is loading." });
    void navigate({ to: "/cart" });
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-background md:max-w-2xl">
      <header className="flex items-center gap-3 border-b border-border px-4 py-4">
        <Link
          to="/"
          aria-label="Back to discover"
          className="grid size-11 place-items-center rounded-full bg-secondary ring-1 ring-border"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <div>
          <h1 className="text-lg leading-none font-black tracking-tight">Sign in</h1>
          <p className="label-mono mt-1 text-muted-foreground">Keep your cart saved</p>
        </div>
      </header>

      <main className="space-y-8 px-4 pt-8 pb-24">
        {user ? (
          <section className="rounded-3xl bg-secondary p-5 ring-1 ring-border">
            <span className="label-mono text-muted-foreground">Signed in as</span>
            <p className="mt-1 text-sm font-bold">{user.name}</p>
            <p className="label-mono mt-1 text-muted-foreground">{user.email}</p>
            <button
              type="button"
              onClick={() => {
                signOut();
                toast("Signed out", { description: "Your cart stays saved to your account." });
              }}
              className="mt-4 h-12 w-full rounded-2xl bg-foreground text-sm font-black tracking-[0.1em] text-background uppercase"
            >
              Sign out
            </button>
          </section>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="email" className="label-mono mb-2 block text-muted-foreground">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-14 w-full rounded-2xl bg-secondary px-4 text-sm ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label htmlFor="password" className="label-mono mb-2 block text-muted-foreground">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-14 w-full rounded-2xl bg-secondary px-4 text-sm ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            {error ? <p className="text-sm font-bold text-destructive">{error}</p> : null}
            <button
              type="submit"
              className="flex h-16 w-full items-center justify-center gap-2 rounded-3xl bg-primary text-sm font-black tracking-[0.1em] text-primary-foreground uppercase shadow-2xl shadow-primary/30 active:scale-[0.98]"
            >
              <LogIn className="size-4" aria-hidden />
              Sign in
            </button>
          </form>
        )}

        <section className="rounded-3xl bg-card p-5 ring-1 ring-border">
          <h2 className="label-mono mb-3 text-muted-foreground">Demo logins</h2>
          <ul className="space-y-2">
            {demoAccounts.map((a) => (
              <li key={a.uid}>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(a.password);
                  }}
                  className="w-full rounded-2xl bg-secondary px-4 py-3 text-left ring-1 ring-border"
                >
                  <span className="block text-sm font-bold">{a.name}</span>
                  <span className="label-mono mt-1 block text-muted-foreground">
                    {a.email} • {a.password}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Tap an account to fill the form. Each demo account keeps its own cart in the cloud.
          </p>
        </section>
      </main>
    </div>
  );
}