import { useEffect, useState } from "react";
import { Users, Wallet } from "lucide-react";
import {
  GROUP_RE,
  useProjectGroupLink,
  useSetGroupLink,
  type GroupKind,
} from "@/hooks/useExtras";
import { Button, Input, useToast } from "@/components/ui";
import { Card } from "@/components/ui";

function Row({
  projectId,
  kind,
  title,
  hint,
}: {
  projectId: string;
  kind: GroupKind;
  title: string;
  hint: string;
}) {
  const toast = useToast();
  const cur = useProjectGroupLink(projectId, kind);
  const save = useSetGroupLink();
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    setUrl(cur.data ?? "");
  }, [cur.data]);

  const submit = async (value: string | null) => {
    if (value && !GROUP_RE.test(value)) {
      setErr("الرابط لازم يبدأ بـ https://chat.whatsapp.com/");
      return;
    }
    setErr("");
    try {
      await save.mutateAsync({ projectId, url: value, kind });
      toast(value ? "تم حفظ الرابط" : "تم إزالة الرابط", "ok");
    } catch {
      setErr("تعذّر الحفظ، حاول مرة أخرى");
    }
  };
  const Icon = kind === "work" ? Users : Wallet;
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 font-extrabold">
        <Icon className="h-4 w-4 text-ok" /> {title}
      </div>
      <p className="mb-2 text-xs leading-6 text-muted">{hint}</p>
      <div className="flex flex-wrap gap-2">
        <Input
          dir="ltr"
          className="min-w-0 flex-1"
          placeholder="https://chat.whatsapp.com/..."
          value={url}
          onChange={(e) => setUrl(e.target.value.trim())}
        />
        <Button
          onClick={() => void submit(url || null)}
          disabled={save.isPending}
        >
          حفظ
        </Button>
        {cur.data && (
          <Button
            variant="ghost"
            onClick={() => void submit(null)}
            disabled={save.isPending}
          >
            إزالة
          </Button>
        )}
      </div>
      {err && <div className="mt-2 text-xs font-bold text-bad">{err}</div>}
    </div>
  );
}

/** Manager tool: the project's two WhatsApp group invite links (what the client's buttons open). */
export function GroupLinkCard({ projectId }: { projectId: string }) {
  return (
    <Card className="mb-4 flex flex-col gap-5 p-5">
      <p className="text-xs leading-6 text-muted">
        من واتساب: افتح الجروب ← معلومات الجروب ← «دعوة عبر رابط» ← انسخ الرابط
        والصقه.
      </p>
      <Row
        projectId={projectId}
        kind="work"
        title="جروب متابعة الأعمال"
        hint="العميل هيشوف زر «جروب متابعة الأعمال» في صفحته."
      />
      <Row
        projectId={projectId}
        kind="finance"
        title="جروب المالية والدفعات"
        hint="جروب توريد الماليات. العميل هيشوف زر «جروب المالية والدفعات»."
      />
    </Card>
  );
}
