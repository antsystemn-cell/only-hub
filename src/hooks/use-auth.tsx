import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "platform_admin" | "merchant_owner" | "merchant_admin" | "merchant_moderator" | "merchant_driver";

export type RoleRow = { role: Role; merchant_id: string | null };

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: RoleRow[];
  isPlatformAdmin: boolean;
  merchantIds: string[];
  primaryMerchantId: string | null;
  refreshRoles: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<RoleRow[]>([]);

  const loadRoles = async (uid: string | null) => {
    if (!uid) {
      setRoles([]);
      return;
    }
    const { data } = await supabase
      .from("user_roles")
      .select("role, merchant_id")
      .eq("user_id", uid);
    const next = (data as RoleRow[]) ?? [];
    // Stable sort so primaryMerchantId never flips between refreshes for
    // users with multiple merchants. Postgres returns rows in unspecified
    // order, which previously caused the merchant orders/delivery pages
    // to occasionally show data for a different merchant or appear empty.
    next.sort((a, b) => {
      const am = a.merchant_id ?? "";
      const bm = b.merchant_id ?? "";
      if (am !== bm) return am < bm ? -1 : 1;
      return a.role.localeCompare(b.role);
    });
    setRoles((prev) => {
      // Avoid replacing the array (and thus invalidating react-query keys)
      // when the role set is unchanged — e.g. on TOKEN_REFRESHED.
      if (prev.length === next.length &&
          prev.every((r, i) => r.role === next[i].role && r.merchant_id === next[i].merchant_id)) {
        return prev;
      }
      return next;
    });
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
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      loadRoles(data.session?.user?.id ?? null).finally(() => setLoading(false));
    });
    return () => subscription.unsubscribe();
  }, []);

  const isPlatformAdmin = roles.some((r) => r.role === "platform_admin");
  const merchantIds = Array.from(
    new Set(roles.filter((r) => r.merchant_id).map((r) => r.merchant_id!))
  ).sort();
  const primaryMerchantId = merchantIds[0] ?? null;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        roles,
        isPlatformAdmin,
        merchantIds,
        primaryMerchantId,
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
