import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type Auth,
  type User as FirebaseUser,
} from "firebase/auth";
import { getFirebaseApp, rtdbGet, rtdbSet } from "./firebase";

export type DemoUser = {
  /** Stable id used as the Firebase key for this customer's saved cart and orders. */
  uid: string;
  name: string;
  email: string;
  initials: string;
  phone: string;
};

type AuthState = {
  user: DemoUser | null;
  hydrated: boolean;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signUp: (input: {
    name: string;
    email: string;
    password: string;
    phone?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

function initialsFor(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "CU";
  if (words.length >= 2) return `${words[0]![0] ?? ""}${words[1]![0] ?? ""}`.toUpperCase();
  const single = words[0]!;
  return single.length >= 2
    ? single.slice(0, 2).toUpperCase()
    : (single[0] ?? "C").toUpperCase().repeat(2);
}

function mapFirebaseUser(fbUser: FirebaseUser): DemoUser {
  const displayName = fbUser.displayName?.trim();
  const fallbackName = fbUser.email ? fbUser.email.split("@")[0]! : "Customer";
  const name = displayName || fallbackName;
  return {
    uid: fbUser.uid,
    name,
    email: fbUser.email ?? "",
    initials: initialsFor(name),
    phone: fbUser.phoneNumber ?? "",
  };
}

function authErrorMessage(code: string): string {
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists. Please sign in instead.";
    case "auth/invalid-email":
      return "That email address doesn't look valid.";
    case "auth/weak-password":
      return "Password is too weak — please use at least 6 characters.";
    case "auth/missing-password":
      return "Please enter your password.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "Invalid email or password. Please check your details or create an account.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network problem — check your connection and try again.";
    case "auth/operation-not-allowed":
      return "Email/password sign-in is not enabled for this Firebase project yet.";
    default:
      return "Something went wrong. Please try again.";
  }
}

function authErrorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DemoUser | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const app = getFirebaseApp();
    if (!app) {
      setHydrated(true);
      return;
    }
    const auth: Auth = getAuth(app);

    // Keep the session alive across refreshes and browser tabs.
    void setPersistence(auth, browserLocalPersistence).catch((err) =>
      console.warn("[auth] could not set persistence:", err),
    );

    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setHydrated(true);
        return;
      }

      setUser(mapFirebaseUser(fbUser));
      setHydrated(true);

      // Phone is rarely on the auth record; fill it from the mirrored profile.
      void rtdbGet<{ name?: string; phone?: string }>(`customers/${fbUser.uid}`).then((profile) => {
        if (!profile) return;
        setUser((prev) => {
          if (!prev || prev.uid !== fbUser.uid) return prev;
          const hasAuthName = Boolean(fbUser.displayName?.trim());
          const name = !hasAuthName && profile.name?.trim() ? profile.name.trim() : prev.name;
          return {
            ...prev,
            name,
            initials: initialsFor(name),
            phone: prev.phone || profile.phone?.trim() || "",
          };
        });
      });
    });

    return unsubscribe;
  }, []);

  const signIn = useCallback<AuthState["signIn"]>(async (email, password) => {
    const app = getFirebaseApp();
    if (!app) return { ok: false, error: "Authentication is unavailable right now." };

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      return { ok: false, error: "Please enter your email and password." };
    }

    try {
      await signInWithEmailAndPassword(getAuth(app), cleanEmail, password);
      return { ok: true };
    } catch (error) {
      console.warn("[auth] sign in failed:", error);
      return { ok: false, error: authErrorMessage(authErrorCode(error)) };
    }
  }, []);

  const signUp = useCallback<AuthState["signUp"]>(async (input) => {
    const cleanEmail = input.email.trim().toLowerCase();
    const cleanName = input.name.trim();
    const cleanPhone = input.phone?.trim() ?? "";

    if (!cleanName || !cleanEmail || !input.password) {
      return { ok: false, error: "Please fill in your name, email and password." };
    }
    if (input.password.length < 6) {
      return { ok: false, error: "Password must be at least 6 characters long." };
    }

    const app = getFirebaseApp();
    if (!app) return { ok: false, error: "Authentication is unavailable right now." };
    const auth = getAuth(app);

    try {
      // Firebase Auth rejects duplicate emails with auth/email-already-in-use.
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, input.password);
      await updateProfile(cred.user, { displayName: cleanName });

      setUser({
        uid: cred.user.uid,
        name: cleanName,
        email: cleanEmail,
        initials: initialsFor(cleanName),
        phone: cleanPhone,
      });
      setHydrated(true);

      // Mirror customer profile to Firebase RTDB (/customers/{uid}) per §8.1 of Integration Guide
      void rtdbSet(`customers/${cred.user.uid}`, {
        id: cred.user.uid,
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        created_at: new Date().toISOString(),
      }).catch((err) => console.warn("[auth] could not mirror to firebase:", err));

      return { ok: true };
    } catch (error) {
      console.warn("[auth] sign up failed:", error);
      return { ok: false, error: authErrorMessage(authErrorCode(error)) };
    }
  }, []);

  const signOut = useCallback(() => {
    const app = getFirebaseApp();
    if (!app) return;
    void firebaseSignOut(getAuth(app)).catch((err) => console.warn("[auth] sign out failed:", err));
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
