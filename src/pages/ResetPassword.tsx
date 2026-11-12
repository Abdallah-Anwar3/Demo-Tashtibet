import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  Button,
  ErrorNote,
  Field,
  Spinner,
  PasswordInput,
} from "@/components/ui";
import Footer from "@/components/Footer";

/** Landing page of the "forgot password" e-mail link. Supabase turns the link into a temporary session. */
export default function ResetPassword() {
  const nav = useNavigate();
  const [ready, setReady] = useState<boolean | null>(null);
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((evt) => {
      if (evt === "PASSWORD_RECOVERY") setReady(true);
    });
    // The recovery event may already have fired before this page mounted.
    void supabase.auth
      .getSession()
      .then(({ data }) => setReady((r) => r ?? !!data.session));
    const t = setTimeout(() => setReady((r) => r ?? false), 4000);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  const submit = async () => {
    if (pw.length < 8) {
      setErr(new Error("كلمة المرور 8 أحرف على الأقل"));
      return;
    }
    if (pw !== again) {
      setErr(new Error("كلمتا المرور غير متطابقتين"));
      return;
    }
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      setErr(error);
      return;
    }
    setDone(true);
    await supabase.auth.signOut();
    setTimeout(() => nav("/login", { replace: true }), 1800);
  };

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-navy p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-7 shadow-2xl">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand">
            <KeyRound className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-xl font-black">تعيين كلمة مرور جديدة</h1>
        </div>
        {ready === null ? (
          <Spinner />
        ) : !ready ? (
          <div className="flex flex-col gap-3 text-center">
            <p className="rounded-lg bg-bad-soft p-3 text-sm font-semibold text-bad">
              الرابط غير صالح أو انتهت صلاحيته. اطلب رابطاً جديداً من شاشة
              الدخول.
            </p>
            <Button onClick={() => nav("/login", { replace: true })}>
              العودة لتسجيل الدخول
            </Button>
          </div>
        ) : done ? (
          <p className="rounded-lg bg-ok-soft p-3 text-center text-sm font-bold text-ok">
            تم تغيير كلمة المرور. جارٍ تحويلك لتسجيل الدخول…
          </p>
        ) : (
          <div className="flex flex-col gap-3.5">
            <Field label="كلمة المرور الجديدة" hint="8 أحرف على الأقل">
              <PasswordInput
                autoComplete="new-password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
            </Field>
            <Field label="تأكيد كلمة المرور">
              <PasswordInput
                autoComplete="new-password"
                value={again}
                onChange={(e) => setAgain(e.target.value)}
              />
            </Field>
            <ErrorNote error={err} />
            <Button size="lg" loading={busy} onClick={() => void submit()}>
              حفظ كلمة المرور
            </Button>
          </div>
        )}
      </div>
      <Footer variant="dark" className="max-w-3xl" />
    </div>
  );
}
