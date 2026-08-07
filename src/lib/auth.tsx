import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type DemoUser = {
  /** Stable id used as the Firebase key for this customer's saved cart. */
  uid: string;
  name: string;
  email: string;
  initials: string;
  phone: string;
};

/** Demo accounts shipped with the app so the saved-cart flow can be tried out. */
export const demoAccounts: Array<DemoUser & { password: string }> = [
  {
    uid: "demo-amara",
    name: "Amara Mitchell",
    email: "demo@hearth.app",
    password: "hearth123",
    initials: "AM",
    phone: "+27 82 555 0142",
  },
  {
    uid: "demo-thabo",
    name: "Thabo Nkosi",
    email: "thabo@hearth.app",
    password: "hearth123",
    initials: "TN",
    phone: "+27 71 555 0088",
  },
];

type AuthState = {
  user: DemoUser | null;
  hydrated: boolean;
  signIn: (email: string, password: string) => { ok: boolean; error?: string };
  signOut: () => void;
};

const AuthContext = createContext<AuthState | null>(null);
const SESSION_KEY = "hearth.session.v1";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DemoUser | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      if (raw) setUser(JSON.parse(raw) as DemoUser);
    } catch {
      /* ignore corrupt session */
    }
    setHydrated(true);
  }, []);

  const signIn = useCallback<AuthState["signIn"]>((email, password) => {
    const match = demoAccounts.find(
      (a) => a.email.toLowerCase() === email.trim().toLowerCase() && a.password === password,
    );
    if (!match) return { ok: false, error: "Those details don't match a demo account." };
    const { password: _pw, ...session } = match;
    setUser(session);
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return { ok: true };
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    window.localStorage.removeItem(SESSION_KEY);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, hydrated, signIn, signOut }),
    [user, hydrated, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}