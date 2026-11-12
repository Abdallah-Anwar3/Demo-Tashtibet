import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isConfigured } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { FEATURES } from "@/lib/features";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  isManager: boolean; // admin or project manager
  signIn: (
    email: string,
    password: string,
    kind: LoginKind,
  ) => Promise<string | null>;
  signOut: () => Promise<void>;
}

export type LoginKind = "manager" | "engineer" | "client";

/** Management tab: admin + project manager. Engineer tab: site engineers. Client tab: clients only. */
export const roleMatchesKind = (role: Profile["role"], kind: LoginKind) =>
  kind === "engineer"
    ? role === "site_engineer"
    : kind === "client"
      ? role === "client"
      : role === "admin" || role === "project_manager";

export const homePath = (role: Profile["role"]) =>
  role === "site_engineer" ? "/app" : role === "client" ? "/client" : "/admin";

const TAB_OF: Record<Profile["role"], string> = {
  admin: "الإدارة",
  project_manager: "الإدارة",
  site_engineer: "مهندس موقع",
  client: "عميل",
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(isConfigured);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, []);

  useEffect(() => {
    if (!isConfigured) return;
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      // defer: calling supabase inside the callback can dead-lock the auth client
      setTimeout(() => void loadProfile(s?.user.id), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const signIn = useCallback(
    async (email: string, password: string, kind: LoginKind) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error || !data.user)
        return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";

      // The login tab must match the account type: engineers only enter through the
      // engineer tab, admins and project managers only through the management tab.
      const { data: p } = await supabase
        .from("profiles")
        .select("role,is_active")
        .eq("id", data.user.id)
        .maybeSingle();
      let msg: string | null = null;
      if (!p) msg = "هذا الحساب غير مرتبط بملف مستخدم. تواصل مع مدير النظام.";
      else if (!p.is_active) msg = "هذا الحساب موقوف. تواصل مع مدير النظام.";
      else if (p.role === "client" && !FEATURES.clientPortal)
        msg = "بوابة العميل غير متاحة في هذه الباقة. تواصل مع الشركة.";
      else if (!roleMatchesKind(p.role as Profile["role"], kind)) {
        msg = `هذا الحساب يتبع خانة «${TAB_OF[p.role as Profile["role"]]}». سجّل الدخول منها.`;
      }
      if (msg) {
        await supabase.auth.signOut();
        return msg;
      }
      return null;
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    // The service worker caches API reads for offline use; drop them so the next
    // person on a shared phone never sees the previous user's data.
    try {
      await caches.delete("api");
      await caches.delete("storage");
    } catch {
      /* Cache API unavailable */
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      loading,
      isAdmin: profile?.role === "admin",
      isManager:
        profile?.role === "admin" || profile?.role === "project_manager",
      signIn,
      signOut,
    }),
    [session, profile, loading, signIn, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
