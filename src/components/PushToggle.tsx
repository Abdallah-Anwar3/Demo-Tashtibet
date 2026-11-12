import { useEffect, useState } from "react";
import { BellOff, BellRing } from "lucide-react";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push";
import { useToast } from "@/components/ui";

/** Enable / disable phone notifications for THIS device (shown inside the bell menu). */
export function PushToggle() {
  const toast = useToast();
  const [st, setSt] = useState<PushState | "loading">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void pushState()
      .then(setSt)
      .catch(() => setSt("unsupported"));
  }, []);

  if (st === "loading" || st === "unsupported") return null;

  const run = async (fn: () => Promise<PushState | void>) => {
    setBusy(true);
    try {
      const r = await fn();
      setSt(r ?? "off");
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };

  const row = "w-full border-t border-line px-4 py-2.5 text-start text-xs";
  if (st === "install-first")
    return (
      <p className={`${row} text-muted`}>
        لتفعيل الإشعارات على الآيفون: افتح الموقع من Safari ← مشاركة ← «إضافة
        إلى الشاشة الرئيسية»، ثم افتح التطبيق من الشاشة الرئيسية.
      </p>
    );
  if (st === "denied")
    return (
      <p className={`${row} text-muted`}>
        الإشعارات محظورة لهذا الموقع. فعّلها من إعدادات المتصفح ثم أعد المحاولة.
      </p>
    );
  if (st === "on")
    return (
      <button
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await disablePush();
            return "off";
          })
        }
        className={`${row} flex items-center gap-2 font-bold text-muted hover:bg-raised`}
      >
        <BellOff className="h-3.5 w-3.5" /> الإشعارات مفعّلة على هذا الجهاز —
        إيقاف
      </button>
    );
  return (
    <button
      disabled={busy}
      onClick={() => void run(enablePush)}
      className={`${row} flex items-center gap-2 font-bold text-brand hover:bg-raised`}
    >
      <BellRing className="h-3.5 w-3.5" /> تفعيل الإشعارات على هذا الجهاز
    </button>
  );
}
