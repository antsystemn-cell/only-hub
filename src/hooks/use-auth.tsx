import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "platform_admin" | "merchant_owner" | "merchant_admin" | "merchant_moderator" | "merchant_driver";

export type RoleRow = { role: Role; merchant_id: string | null; created_at?: string };

const ACTIVE_MERCHANT_KEY = "only.activeMerchantId";

function readStoredMerchantId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_MERCHANT_KEY);
}

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  rolesLoaded: boolean;
  rolesError: string | null;
  roles: RoleRow[];
  isPlatformAdmin: boolean;
  merchantIds: string[];
  primaryMerchantId: string | null;
  setPrimaryMerchantId: (merchantId: string | null) => void;
  refreshRoles: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

const AUTH_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} timeout`)), AUTH_TIMEOUT_MS);
    }),
  ]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [selectedMerchantId, setSelectedMerchantId] = useState<string | null>(readStoredMerchantId);
  const [preferredMerchantId, setPreferredMerchantId] = useState<string | null>(null);

  const loadRoles = async (uid: string | null) => {
    setRolesLoaded(false);
    setRolesError(null);
    if (!uid) {
      setRoles([]);
      setPreferredMerchantId(null);
      setRolesLoaded(true);
      return;
    }
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("user_roles")
          .select("role, merchant_id, created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: true }),
        "roles",
      );
      if (error) throw error;
      const next = (data as RoleRow[]) ?? [];
      // Stable role order. The active merchant itself is selected below from
      // persisted choice or latest merchant activity, so an empty test merchant
      // cannot accidentally become the default delivery/orders context.
      next.sort((a, b) => {
        const at = a.created_at ?? "";
        const bt = b.created_at ?? "";
        if (at !== bt) return at < bt ? -1 : 1;
        const am = a.merchant_id ?? "";
        const bm = b.merchant_id ?? "";
        if (am !== bm) return am.localeCompare(bm);
        return a.role.localeCompare(b.role);
      });
      const nextMerchantIds = Array.from(
        new Set(next.filter((r) => r.merchant_id).map((r) => r.merchant_id!)),
      );
      let nextPreferredMerchantId = nextMerchantIds[0] ?? null;
      if (nextMerchantIds.length > 0) {
        const { data: recentOrders, error: ordersError } = await withTimeout(
          supabase
            .from("orders")
            .select("merchant_id, created_at")
            .in("merchant_id", nextMerchantIds)
            .order("created_at", { ascending: false })
            .limit(1),
          "merchant activity",
        );
        if (ordersError) {
          console.error("[auth] Failed to load latest merchant activity", ordersError);
        } else if (recentOrders?.[0]?.merchant_id) {
          nextPreferredMerchantId = recentOrders[0].merchant_id;
        }
      }
      setPreferredMerchantId(nextPreferredMerchantId);
      setRoles((prev) => {
        // Avoid replacing the array (and thus invalidating react-query keys)
        // when the role set is unchanged — e.g. on TOKEN_REFRESHED.
        if (prev.length === next.length &&
            prev.every((r, i) => r.role === next[i].role && r.merchant_id === next[i].merchant_id)) {
          return prev;
        }
        return next;
      });
    } catch (error) {
      console.error("[auth] Failed to load roles", error);
      setRolesError(error instanceof Error ? error.message : "roles load failed");
      setRoles([]);
      setPreferredMerchantId(null);
    } finally {
      setRolesLoaded(true);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      // Only reload roles on identity transitions. TOKEN_REFRESHED fires
      // hourly + on tab focus, and INITIAL_SESSION fires on every mount —
      // reloading roles there caused primaryMerchantId to momentarily
      // become null, which blanked the orders and delivery dashboards.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setTimeout(() => { loadRoles(sess?.user?.id ?? null); }, 0);
      }
    });
    withTimeout(supabase.auth.getSession(), "session")
      .then(({ data }) => {
        setSession(data.session);
        setUser(data.session?.user ?? null);
        return loadRoles(data.session?.user?.id ?? null);
      })
      .catch((error) => {
        console.error("[auth] Failed to load session", error);
        setSession(null);
        setUser(null);
        setRoles([]);
        setPreferredMerchantId(null);
        setRolesError(error instanceof Error ? error.message : "session load failed");
        setRolesLoaded(true);
      })
      .finally(() => setLoading(false));
    return () => subscription.unsubscribe();
  }, []);

  const isPlatformAdmin = roles.some((r) => r.role === "platform_admin");
  const merchantIds = Array.from(
    new Set(roles.filter((r) => r.merchant_id).map((r) => r.merchant_id!))
  );
  const primaryMerchantId =
    selectedMerchantId && merchantIds.includes(selectedMerchantId)
      ? selectedMerchantId
      : preferredMerchantId && merchantIds.includes(preferredMerchantId)
        ? preferredMerchantId
        : merchantIds[0] ?? null;

  const updatePrimaryMerchantId = (merchantId: string | null) => {
    if (typeof window !== "undefined") {
      if (merchantId) window.localStorage.setItem(ACTIVE_MERCHANT_KEY, merchantId);
      else window.localStorage.removeItem(ACTIVE_MERCHANT_KEY);
    }
    setSelectedMerchantId(merchantId);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        rolesLoaded,
        rolesError,
        roles,
        isPlatformAdmin,
        merchantIds,
        primaryMerchantId,
        setPrimaryMerchantId: updatePrimaryMerchantId,
        refreshRoles: () => loadRoles(user?.id ?? null),
        signOut: async () => { await supabase.auth.signOut(); },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
