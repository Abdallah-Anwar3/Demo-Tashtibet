import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  useChangeOrders,
  useDeleteChangeOrder,
  useSaveChangeOrder,
  type ChangeOrder,
} from "@/hooks/useBusiness";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Input,
  Modal,
  Spinner,
  Textarea,
} from "@/components/ui";
import { fmtDate, money } from "@/lib/format";

export const CO_STATUS: Record<
  ChangeOrder["status"],
  { label: string; tone: "warn" | "ok" | "bad" }
> = {
  pending: { label: "بانتظار العميل", tone: "warn" },
  approved: { label: "اعتمده العميل", tone: "ok" },
  rejected: { label: "رفضه العميل", tone: "bad" },
};

/** أوامر التغيير: تغيير في النطاق بتكلفته ومدته، لا يُنفَّذ إلا بموافقة العميل من بوابته. */
export function ChangeOrdersPanel({ projectId }: { projectId: string }) {
  const q = useChangeOrders(projectId);
  const save = useSaveChangeOrder();
  const del = useDeleteChangeOrder();
  const [f, setF] = useState<{
    title: string;
    description: string;
    cost: string;
    days: string;
  } | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const list = q.data ?? [];
  const ok = list.filter((c) => c.status === "approved");
  const cost = ok.reduce((s, c) => s + c.cost_delta, 0);
  const days = ok.reduce((s, c) => s + c.days_delta, 0);

  const submit = () => {
    if (!f) return;
    const c = Number(f.cost),
      d = Math.round(Number(f.days) || 0);
    if (!f.title.trim() || !Number.isFinite(c)) {
      setErr(new Error("اكتب عنوان التغيير والتكلفة (موجب زيادة، سالب خصم)"));
      return;
    }
    save.mutate(
      {
        project_id: projectId,
        title: f.title.trim(),
        description: f.description.trim() || null,
        cost_delta: c,
        days_delta: d,
      },
      { onSuccess: () => setF(null), onError: (e) => setErr(e) },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-extrabold">أوامر التغيير</h3>
          <Button
            size="sm"
            onClick={() => {
              setF({ title: "", description: "", cost: "", days: "0" });
              setErr(null);
            }}
          >
            <Plus className="h-4 w-4" /> أمر تغيير
          </Button>
        </div>
        {!!ok.length && (
          <div className="mb-3 rounded-lg bg-ok-soft p-3 text-sm font-bold text-ok">
            المعتمد من العميل:{" "}
            <span className="num">
              {cost >= 0 ? "+" : "−"}
              {money(Math.abs(cost))}
            </span>{" "}
            ·{" "}
            <span className="num">
              {days >= 0 ? "+" : "−"}
              {Math.abs(days)}
            </span>{" "}
            يوم
          </div>
        )}
        {q.isLoading ? (
          <Spinner />
        ) : !list.length ? (
          <Empty>
            لا توجد أوامر تغيير. أضف أمراً بتكلفته ومدته وسيصل العميل إشعار
            ليوافق أو يرفض.
          </Empty>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-start justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <div className="font-bold">{c.title}</div>
                  {c.description && (
                    <p className="text-sm text-muted">{c.description}</p>
                  )}
                  <div className="num mt-1 text-sm">
                    {c.cost_delta >= 0 ? "+" : "−"}
                    {money(Math.abs(c.cost_delta))} ·{" "}
                    {c.days_delta >= 0 ? "+" : "−"}
                    {Math.abs(c.days_delta)} يوم ·{" "}
                    <span className="text-muted">{fmtDate(c.created_at)}</span>
                  </div>
                  {c.client_note && (
                    <p className="mt-1 rounded bg-raised p-2 text-sm">
                      ملاحظة العميل: {c.client_note}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={CO_STATUS[c.status].tone}>
                    {CO_STATUS[c.status].label}
                  </Badge>
                  {c.status === "pending" && (
                    <Button
                      size="sm"
                      variant="danger"
                      aria-label="حذف"
                      onClick={() => {
                        if (confirm("حذف أمر التغيير؟")) del.mutate(c.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={!!f}
        onClose={() => setF(null)}
        title="أمر تغيير جديد"
        footer={
          <>
            <Button variant="secondary" onClick={() => setF(null)}>
              إلغاء
            </Button>
            <Button loading={save.isPending} onClick={submit}>
              إرسال للعميل
            </Button>
          </>
        }
      >
        {f && (
          <div className="flex flex-col gap-3">
            <Field label="ما التغيير؟">
              <Input
                value={f.title}
                onChange={(e) => setF({ ...f, title: e.target.value })}
                placeholder="مثال: تغيير بلاط الصالة إلى بورسلين"
              />
            </Field>
            <Field label="التفاصيل (اختياري)">
              <Textarea
                rows={3}
                value={f.description}
                onChange={(e) => setF({ ...f, description: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="فرق التكلفة (ج.م)" hint="موجب زيادة، سالب خصم">
                <Input
                  type="number"
                  step="any"
                  value={f.cost}
                  onChange={(e) => setF({ ...f, cost: e.target.value })}
                />
              </Field>
              <Field label="فرق المدة (أيام)">
                <Input
                  type="number"
                  step="1"
                  value={f.days}
                  onChange={(e) => setF({ ...f, days: e.target.value })}
                />
              </Field>
            </div>
            <p className="text-[11px] text-muted">
              بعد إرسال الأمر لا يمكن تعديل مبلغه. القرار يصدر من العميل فقط.
            </p>
            <ErrorNote error={err} />
          </div>
        )}
      </Modal>
    </div>
  );
}
