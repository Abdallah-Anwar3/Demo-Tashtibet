import { useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Button,
  ErrorNote,
  Field,
  Modal,
  useToast,
  PasswordInput,
} from "@/components/ui";
import { DEMO_LOCKED_MSG, IS_DEMO } from "@/lib/demo";

/** Lets a signed-in user choose a new password (the session already proves who they are). */
export function ChangePasswordModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setPw("");
    setAgain("");
    setErr(null);
    onClose();
  };

  const submit = async () => {
    if (IS_DEMO) {
      setErr(new Error(DEMO_LOCKED_MSG));
      return;
    }
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
      setErr(
        new Error(
          error.message.includes("different")
            ? "اختر كلمة مرور مختلفة عن الحالية"
            : error.message,
        ),
      );
      return;
    }
    toast("تم تغيير كلمة المرور");
    close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="تغيير كلمة المرور"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            إلغاء
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            حفظ
          </Button>
        </>
      }
    >
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
      </div>
    </Modal>
  );
}
