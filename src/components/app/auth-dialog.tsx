import { useState } from "react";
import { Check, Gift, LogIn, Sparkles, User, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

export function AuthDialog({
  open,
  onClose,
  onSuccess,
  title = "Sign In or Register",
  description = "Please sign in or create an account to place your order and earn loyalty points.",
}: {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  title?: string;
  description?: string;
}) {
  const { signIn, signUp } = useAuth();
  const [tab, setTab] = useState<"signin" | "register">("signin");

  // Sign In state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  // Register state
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPhone, setRegisterPhone] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerError, setRegisterError] = useState<string | null>(null);

  if (!open) return null;

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    const res = signIn(loginEmail, loginPassword);
    if (!res.ok) {
      setLoginError(res.error || "Sign in failed.");
      return;
    }
    toast.success("Welcome back!", { description: "Signed in successfully." });
    onClose();
    if (onSuccess) onSuccess();
  }

  function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegisterError(null);
    const res = signUp({
      name: registerName,
      email: registerEmail,
      phone: registerPhone,
      password: registerPassword,
    });
    if (!res.ok) {
      setRegisterError(res.error || "Registration failed.");
      return;
    }
    toast.success("Account created!", { description: "You are now signed in." });
    onClose();
    if (onSuccess) onSuccess();
  }

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-background/80 backdrop-blur-md animate-[var(--animate-sheet-up)]">
      <div className="relative w-full max-w-md rounded-3xl bg-card p-6 border border-border shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary shrink-0">
              <User className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-foreground">{title}</h2>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{description}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Benefits Pill */}
        <div className="rounded-2xl bg-primary/10 p-3 border border-primary/20 flex items-center gap-2.5 text-xs text-primary font-bold">
          <Gift className="size-4 shrink-0" />
          <span>Earn 10% loyalty rewards & save addresses in the cloud</span>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex rounded-2xl bg-secondary p-1 border border-border">
          <button
            type="button"
            onClick={() => setTab("signin")}
            className={`flex-1 h-9 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
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
            className={`flex-1 h-9 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              tab === "register"
                ? "bg-background text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Create Account
          </button>
        </div>

        {tab === "signin" ? (
          /* Sign In Form */
          <form onSubmit={handleLogin} className="space-y-3 pt-1">
            <div className="space-y-1">
              <label className="label-mono block text-muted-foreground font-bold text-xs">
                Email
              </label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="e.g. you@example.com"
                className="h-11 w-full rounded-xl bg-secondary px-3.5 text-xs font-medium border border-border outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="space-y-1">
              <label className="label-mono block text-muted-foreground font-bold text-xs">
                Password
              </label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="h-11 w-full rounded-xl bg-secondary px-3.5 text-xs font-medium border border-border outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {loginError ? (
              <p className="text-xs text-destructive font-bold">{loginError}</p>
            ) : null}

            <button
              type="submit"
              className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-wider text-xs shadow-md hover:bg-primary/90 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <LogIn className="size-4" />
              <span>Sign In & Continue</span>
            </button>

          </form>
        ) : (
          /* Register Form */
          <form onSubmit={handleRegister} className="space-y-3 pt-1">
            <div className="space-y-1">
              <label className="label-mono block text-muted-foreground font-bold text-xs">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
                placeholder="e.g. Alex Mercer"
                className="h-11 w-full rounded-xl bg-secondary px-3.5 text-xs font-medium border border-border outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="label-mono block text-muted-foreground font-bold text-xs">
                  Email *
                </label>
                <input
                  type="email"
                  required
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  placeholder="alex@example.com"
                  className="h-11 w-full rounded-xl bg-secondary px-3.5 text-xs font-medium border border-border outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="space-y-1">
                <label className="label-mono block text-muted-foreground font-bold text-xs">
                  Phone (optional)
                </label>
                <input
                  type="tel"
                  value={registerPhone}
                  onChange={(e) => setRegisterPhone(e.target.value)}
                  placeholder="+27 82 555 0100"
                  className="h-11 w-full rounded-xl bg-secondary px-3.5 text-xs font-medium border border-border outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="label-mono block text-muted-foreground font-bold text-xs">
                Password *
              </label>
              <input
                type="password"
                required
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                placeholder="Create a password"
                className="h-11 w-full rounded-xl bg-secondary px-3.5 text-xs font-medium border border-border outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {registerError ? (
              <p className="text-xs text-destructive font-bold">{registerError}</p>
            ) : null}

            <button
              type="submit"
              className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-wider text-xs shadow-md hover:bg-primary/90 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <UserPlus className="size-4" />
              <span>Create Account & Continue</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
