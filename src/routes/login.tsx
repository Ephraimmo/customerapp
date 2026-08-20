import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Gift, LogIn, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in or Register — Hearth" },
      {
        name: "description",
        content: "Sign in or create an account on Hearth to keep your cart, addresses, loyalty points and orders saved.",
      },
      { property: "og:title", content: "Sign in or Register — Hearth" },
      {
        property: "og:description",
        content: "Your cart and loyalty rewards follow your account, so it's waiting whenever you come back.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { signIn, signUp, user, signOut } = useAuth();
  const [tab, setTab] = useState<"signin" | "register">("signin");

  // Sign In State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Register State
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPhone, setRegisterPhone] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerError, setRegisterError] = useState<string | null>(null);

  function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    const result = signIn(email, password);
    if (!result.ok) {
      setError(result.error ?? "Sign in failed.");
      return;
    }
    setError(null);
    toast.success("Welcome back!", { description: "Signed in successfully." });
    void navigate({ to: "/cart" });
  }

  function submitRegister(e: React.FormEvent) {
    e.preventDefault();
    const result = signUp({
      name: registerName,
      email: registerEmail,
      phone: registerPhone,
      password: registerPassword,
    });
    if (!result.ok) {
      setRegisterError(result.error ?? "Registration failed.");
      return;
    }
    setRegisterError(null);
    toast.success("Account created!", { description: "You are now signed in." });
    void navigate({ to: "/cart" });
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-full bg-background px-0 sm:max-w-[640px] md:max-w-2xl">
      <header className="flex items-center gap-3 border-b border-border px-4 py-4">
        <Link
          to="/"
          aria-label="Back to discover"
          className="grid size-11 place-items-center rounded-full bg-secondary ring-1 ring-border"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <div>
          <h1 className="text-lg leading-none font-black tracking-tight">
            {tab === "signin" ? "Sign in" : "Create Account"}
          </h1>
          <p className="label-mono mt-1 text-muted-foreground">Keep your cart & loyalty points saved</p>
        </div>
      </header>

      <main className="space-y-6 px-4 pt-6 pb-24">
        {user ? (
          <section className="rounded-3xl bg-secondary p-5 ring-1 ring-border space-y-3">
            <span className="label-mono text-muted-foreground">Signed in as</span>
            <p className="text-base font-bold text-foreground">{user.name}</p>
            <p className="label-mono text-xs text-muted-foreground">{user.email} • {user.phone}</p>
            <div className="pt-2 flex gap-2">
              <Link
                to="/cart"
                className="flex-1 h-12 rounded-2xl bg-primary text-primary-foreground text-xs font-black tracking-wider uppercase flex items-center justify-center shadow-md hover:bg-primary/90 transition-all cursor-pointer"
              >
                Go to Cart
              </Link>
              <button
                type="button"
                onClick={() => {
                  signOut();
                  toast("Signed out", { description: "You are now browsing as guest." });
                }}
                className="h-12 px-5 rounded-2xl bg-secondary text-xs font-bold text-foreground ring-1 ring-border hover:bg-secondary/80 transition-colors cursor-pointer"
              >
                Sign out
              </button>
            </div>
          </section>
        ) : (
          <div className="space-y-4">
            {/* Mode Switcher Tabs */}
            <div className="flex rounded-2xl bg-secondary p-1 border border-border">
              <button
                type="button"
                onClick={() => setTab("signin")}
                className={`flex-1 h-10 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                  tab === "signin"
                    ? "bg-background text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setTab("register")}
                className={`flex-1 h-10 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                  tab === "register"
                    ? "bg-background text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Register
              </button>
            </div>

            {/* Benefit Pill */}
            <div className="rounded-2xl bg-primary/10 p-3.5 border border-primary/20 flex items-center gap-2.5 text-xs text-primary font-bold">
              <Gift className="size-4 shrink-0" />
              <span>Earn points on deliveries & save addresses in the cloud</span>
            </div>

            {tab === "signin" ? (
              <form onSubmit={submitLogin} className="space-y-4 pt-1">
                <div>
                  <label htmlFor="email" className="label-mono mb-1.5 block text-muted-foreground text-xs">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="e.g. you@example.com"
                    className="h-12 w-full rounded-2xl bg-secondary px-4 text-sm ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label htmlFor="password" className="label-mono mb-1.5 block text-muted-foreground text-xs">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="h-12 w-full rounded-2xl bg-secondary px-4 text-sm ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                {error ? <p className="text-xs font-bold text-destructive">{error}</p> : null}
                <button
                  type="submit"
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-black tracking-[0.1em] text-primary-foreground uppercase shadow-xl shadow-primary/25 active:scale-[0.98] cursor-pointer hover:bg-primary/90 transition-all"
                >
                  <LogIn className="size-4" aria-hidden />
                  Sign in
                </button>
              </form>
            ) : (
              <form onSubmit={submitRegister} className="space-y-4 pt-1">
                <div>
                  <label htmlFor="reg-name" className="label-mono mb-1.5 block text-muted-foreground text-xs">
                    Full Name *
                  </label>
                  <input
                    id="reg-name"
                    type="text"
                    required
                    value={registerName}
                    onChange={(e) => setRegisterName(e.target.value)}
                    placeholder="e.g. Alex Mercer"
                    className="h-12 w-full rounded-2xl bg-secondary px-4 text-sm ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="reg-email" className="label-mono mb-1.5 block text-muted-foreground text-xs">
                      Email *
                    </label>
                    <input
                      id="reg-email"
                      type="email"
                      required
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      placeholder="alex@example.com"
                      className="h-12 w-full rounded-2xl bg-secondary px-4 text-sm ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-phone" className="label-mono mb-1.5 block text-muted-foreground text-xs">
                      Phone (optional)
                    </label>
                    <input
                      id="reg-phone"
                      type="tel"
                      value={registerPhone}
                      onChange={(e) => setRegisterPhone(e.target.value)}
                      placeholder="+27 82 555 0100"
                      className="h-12 w-full rounded-2xl bg-secondary px-4 text-sm ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="reg-pw" className="label-mono mb-1.5 block text-muted-foreground text-xs">
                    Password *
                  </label>
                  <input
                    id="reg-pw"
                    type="password"
                    required
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    placeholder="Create a secure password"
                    className="h-12 w-full rounded-2xl bg-secondary px-4 text-sm ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                {registerError ? <p className="text-xs font-bold text-destructive">{registerError}</p> : null}
                <button
                  type="submit"
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-black tracking-[0.1em] text-primary-foreground uppercase shadow-xl shadow-primary/25 active:scale-[0.98] cursor-pointer hover:bg-primary/90 transition-all"
                >
                  <UserPlus className="size-4" aria-hidden />
                  Create Account
                </button>
              </form>
            )}

          </div>
        )}
      </main>
    </div>
  );
}
