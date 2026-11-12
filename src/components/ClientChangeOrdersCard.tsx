import { useState } from "react";
import { useChangeOrders, useDecideChangeOrder } from "@/hooks/useBusiness";
import {
  Badge,
  Button,
  Card,
  ErrorNote,
  Textarea,
  useToast,
} from "@/components/ui";
import { CO_STATUS } from "@/components/ChangeOrdersPanel";
import { fmtDate, money } from "@/lib/format";

const MY_LABEL = {
  pending: "بانتظار قرارك",
  approved: "وافقت",
  rejected: "رفضت",
} as const;

/** يظهر للعميل فقط إذا وُجد أمر تغيير. الموافقة أو الرفض نهائيان. */
export function ClientChangeOrdersCard({ projectId }: { projectId: string }) {
  const toast = useToast();
  const q = useChangeOrders(projectId);
  const decide = useDecideChangeOrder();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [err, setErr] = useState<unknown>(null);
  const list = q.data ?? [];
  if (!list.length) return null;

  const act = (id: string, approve: boolean) => {
    setErr(null);
    decide.mutate(
      { id, approve, note: notes[id] ?? "" },
      {
        onSuccess: () => toast(approve ? "تمت الموافقة" : "تم الرفض"),
        onError: (e) => setErr(e),
      },
    );
  };

  return (
    <Card className="p-5">
      <h2 className="mb-3 font-extrabold">طلبات اعتماد التغيير</h2>
      <ul className="divide-y divide-line">
        {list.map((c) => (
          <li key={c.id} className="py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-bold">{c.title}</div>
                {c.description && (
                  <p className="text-sm text-muted">{c.description}</p>
                )}
                <div className="num mt-1 text-sm">
                  {c.cost_delta >= 0 ? "زيادة" : "خصم"}{" "}
                  {money(Math.abs(c.cost_delta))}
                  {c.days_delta !== 0 && (
                    <>
                      {" "}
                      · {c.days_delta > 0 ? "تمديد" : "تقليل"}{" "}
                      {Math.abs(c.days_delta)} يوم
                    </>
                  )}
                  <span className="text-muted"> · {fmtDate(c.created_at)}</span>
                </div>
              </div>
              <Badge tone={CO_STATUS[c.status].tone}>
                {MY_LABEL[c.status]}
              </Badge>
            </div>
            {c.status === "pending" && (
              <div className="mt-3 flex flex-col gap-2">
                <Textarea
                  rows={2}
                  placeholder="ملاحظة (اختياري)"
                  value={notes[c.id] ?? ""}
                  onChange={(e) =>
                    setNotes({ ...notes, [c.id]: e.target.value })
                  }
                />
                <div className="flex gap-2">
                  <Button
                    variant="ok"
                    loading={decide.isPending}
                    onClick={() => act(c.id, true)}
                  >
                    أوافق
                  </Button>
                  <Button
                    variant="danger"
                    loading={decide.isPending}
                    onClick={() => act(c.id, false)}
                  >
                    أرفض
                  </Button>
                </div>
              </div>
            )}
            {c.client_note && c.status !== "pending" && (
              <p className="mt-1 text-sm text-muted">
                ملاحظتك: {c.client_note}
              </p>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-2">
        <ErrorNote error={err} />
      </div>
    </Card>
  );
}
