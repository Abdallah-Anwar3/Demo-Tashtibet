import { BRAND } from "@/config/brand";
import { FEATURES } from "@/lib/features";
import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { HardHat, ShieldCheck, UserRound } from "lucide-react";
import { homePath, roleMatchesKind, useAuth } from "@/hooks/useAuth";
import { isConfigured, supabase } from "@/lib/supabase";
import { Button, Field, Input, PasswordInput } from "@/components/ui";
import { cn } from "@/lib/utils";
import Footer from "@/components/Footer";
import { Logo } from "@/components/Logo";
import DemoBanner from "@/components/DemoBanner";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, IS_DEMO } from "@/lib/demo";

/** The role picker only changes the wording; the real role always comes from the database. */
const KINDS = [
  { id: "manager", label: "الإدارة", icon: ShieldCheck },
  { id: "engineer", label: "مهندس موقع", icon: HardHat },
  { id: "client", label: "عميل", icon: UserRound },
] as const;
/** On plans without the client portal the client tab doesn't exist at all. */
const SHOWN_KINDS = KINDS.filter(
  (k) => k.id !== "client" || FEATURES.clientPortal,
);

export default function Login() {
  const { session, profile, loading, signIn, signOut } = useAuth();
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("manager");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const suspended = !!session && !!profile && !profile.is_active;
  useEffect(() => {
    if (suspended) void signOut();
  }, [suspended, signOut]);

  // Only redirect when the account matches the selected tab, so a wrong-tab login is
  // never let through even for the instant before signIn() signs it out.
  if (session && profile?.is_active && roleMatchesKind(profile.role, kind)) {
    return <Navigate to={homePath(profile.role)} replace />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const msg = await signIn(email, password, kind);
    if (msg) setErr(msg);
    setBusy(false);
  };

  /** Demo only: sign in as one of the fake accounts with a single tap. */
  const demoLogin = async (k: (typeof KINDS)[number]["id"], em: string) => {
    setKind(k);
    setEmail(em);
    setPassword(DEMO_PASSWORD);
    setBusy(true);
    setErr(null);
    const msg = await signIn(em, DEMO_PASSWORD, k);
    if (msg) setErr(msg);
    setBusy(false);
  };

  const forgot = async () => {
    setErr(null);
    setInfo(null);
    if (!email.trim()) {
      setErr("اكتب بريدك الإلكتروني أولاً ثم اضغط «نسيت كلمة المرور».");
      return;
    }
    setBusy(true);
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    // Same answer whether or not the address exists, so the form cannot be used to probe accounts.
    setInfo(
      "إذا كان البريد مسجلاً لدينا فقد أرسلنا إليه رابطاً لتعيين كلمة مرور جديدة.",
    );
  };

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-navy p-4">
      {IS_DEMO && (
        <div className="mb-3 w-full max-w-sm overflow-hidden rounded-xl">
          <DemoBanner />
        </div>
      )}
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl bg-card p-7 shadow-2xl"
      >
        <div className="mb-6 text-center">
          <Logo className="mx-auto mb-3 h-36 w-auto" />
          <h1 className="text-xl font-black">{BRAND.name}</h1>
          <p className="text-xs font-bold text-brand">{BRAND.tagline}</p>
          <p className="mt-1 text-sm text-muted">سجّل الدخول للمتابعة</p>
        </div>

        {!isConfigured && (
          <div className="mb-4 rounded-lg bg-warn-soft p-3 text-xs font-semibold text-warn">
            لم يتم ضبط الاتصال بـ Supabase. انسخ ملف{" "}
            <span dir="ltr">.env.example</span> إلى{" "}
            <span dir="ltr">.env.local</span> وأضف بيانات مشروعك.
          </div>
        )}

        <div
          className="mb-4 grid grid-cols-3 gap-2 rounded-xl bg-raised p-1"
          role="tablist"
        >
          {SHOWN_KINDS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={kind === id}
              onClick={() => setKind(id)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs sm:text-sm font-bold transition",
                kind === id ? "bg-card text-brand shadow-sm" : "text-muted",
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3.5">
          <Field label="البريد الإلكتروني">
            <Input
              type="email"
              dir="ltr"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
            />
          </Field>
          <Field label="كلمة المرور">
            <PasswordInput
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {info && (
            <div
              role="status"
              className="rounded-lg bg-ok-soft p-2.5 text-sm font-semibold text-ok"
            >
              {info}
            </div>
          )}
          {err && (
            <div
              role="alert"
              className="rounded-lg bg-bad-soft p-2.5 text-sm font-semibold text-bad"
            >
              {err}
            </div>
          )}
          <Button type="submit" size="lg" loading={busy || loading}>
            {kind === "manager"
              ? "دخول الإدارة"
              : kind === "engineer"
                ? "دخول المهندس"
                : "دخول العميل"}
          </Button>
        </div>
        {!IS_DEMO && (
          <button
            type="button"
            onClick={() => void forgot()}
            className="mt-3 w-full text-center text-xs font-bold text-brand"
          >
            نسيت كلمة المرور؟
          </button>
        )}
        {IS_DEMO ? (
          <div className="mt-4 border-t border-line pt-3">
            <p className="mb-2 text-center text-xs font-bold text-muted">
              دخول سريع بحساب تجريبي
            </p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.filter(
                (a) => a.kind !== "client" || FEATURES.clientPortal,
              ).map((a) => (
                <button
                  key={a.email}
                  type="button"
                  disabled={busy}
                  onClick={() => void demoLogin(a.kind, a.email)}
                  className="rounded-lg border border-line bg-raised py-2 text-xs font-bold hover:border-brand hover:text-brand disabled:opacity-60"
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-center text-xs text-muted">
            الحسابات تُنشأ بواسطة مدير النظام فقط.
          </p>
        )}
      </form>
      <Footer variant="dark" className="max-w-3xl" />
    </div>
  );
}
