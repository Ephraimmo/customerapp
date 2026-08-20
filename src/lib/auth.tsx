import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { rtdbSet } from "./firebase";

export type DemoUser = {
  /** Stable id used as the Firebase key for this customer's saved cart and orders. */
  uid: string;
  name: string;
  email: string;
  initials: string;
  phone: string;
};

export type StoredAccount = DemoUser & { password: string; created_at?: string };

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
  signUp: (input: {
    name: string;
    email: string;
    password: string;
    phone?: string;
  }) => { ok: boolean; error?: string };
  signOut: () => void;
};

const AuthContext = createContext<AuthState | null>(null);
const SESSION_KEY = "hearth.session.v1";
const ACCOUNTS_KEY = "hearth.accounts.v1";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DemoUser | null>(null);
  const [accounts, setAccounts] = useState<StoredAccount[]>(demoAccounts);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const rawAccounts = window.localStorage.getItem(ACCOUNTS_KEY);
      if (rawAccounts) {
        const parsed = JSON.parse(rawAccounts) as StoredAccount[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge custom accounts with demo accounts
          const map = new Map<string, StoredAccount>();
          demoAccounts.forEach((a) => map.set(a.email.toLowerCase(), a));
          parsed.forEach((a) => map.set(a.email.toLowerCase(), a));
          setAccounts(Array.from(map.values()));
        }
      }
    } catch {
      /* ignore */
    }

    try {
      const rawSession = window.localStorage.getItem(SESSION_KEY);
      if (rawSession) setUser(JSON.parse(rawSession) as DemoUser);
    } catch {
      /* ignore corrupt session */
    }
    setHydrated(true);
  }, []);

  const signIn = useCallback<AuthState["signIn"]>(
    (email, password) => {
      const cleanEmail = email.trim().toLowerCase();
      const match = accounts.find(
        (a) => a.email.toLowerCase() === cleanEmail && a.password === password,
      );
      if (!match) {
        return {
          ok: false,
          error: "Invalid email or password. Please check your details or create an account.",
        };
      }
      const { password: _pw, ...session } = match;
      setUser(session);
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      return { ok: true };
    },
    [accounts],
  );

  const signUp = useCallback<AuthState["signUp"]>((input) => {
    const cleanEmail = input.email.trim().toLowerCase();
    const cleanName = input.name.trim();

    if (!cleanName || !cleanEmail || !input.password) {
      return { ok: false, error: "Please fill in your name, email and password." };
    }

    // Generate unique ID and initials
    const words = cleanName.split(/\s+/).filter(Boolean);
    const initials =
      words.length >= 2
        ? `${words[0]![0]}${words[1]![0]}`.toUpperCase()
        : cleanName.slice(0, 2).toUpperCase();

    const uid = `cust_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const phone = input.phone?.trim() || "+27 82 555 0100";

    const newAccount: StoredAccount = {
      uid,
      name: cleanName,
      email: cleanEmail,
      password: input.password,
      initials,
      phone,
      created_at: new Date().toISOString(),
    };

    setAccounts((prev) => {
      const next = [...prev.filter((a) => a.email.toLowerCase() !== cleanEmail), newAccount];
      try {
        window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

    const { password: _pw, ...session } = newAccount;
    setUser(session);
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));

    // Mirror customer profile to Firebase RTDB (/customers/{uid}) per §8.1 of Integration Guide
    void rtdbSet(`customers/${uid}`, {
      id: uid,
      name: cleanName,
      email: cleanEmail,
      phone,
      created_at: new Date().toISOString(),
    }).catch((err) => console.warn("[auth] could not mirror to firebase:", err));

    return { ok: true };
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    window.localStorage.removeItem(SESSION_KEY);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, hydrated, signIn, signUp, signOut }),
    [user, hydrated, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
