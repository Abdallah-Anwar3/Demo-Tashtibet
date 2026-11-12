import { useState } from "react";
import { Plus, Trash2, Wallet } from "lucide-react";
import {
  useAddSubPayment,
  useDeleteSubPayment,
  useDeleteSubcontract,
  useSaveSubcontract,
  useSubcontracts,
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
  useToast,
} from "@/components/ui";
import { fmtDate, money } from "@/lib/format";

/** مقاولو الباطن في المشروع: اتفاق، دفعات بالتقسيط، ولا يُسمح بدفع أكثر من المتبقي. */
export function SubcontractsPanel({ projectId }: { projectId: string }) {
  const toast = useToast();
  const q = useSubcontracts(projectId);
  const save = useSaveSubcontract();
  const delSub = useDeleteSubcontract();
  const addPay = useAddSubPayment();
  const delPay = useDeleteSubPayment();
  const [f, setF] = useState<{
    name: string;
    trade: string;
    phone: string;
    amount: string;
  } | null>(null);
  const [pay, setPay] = useState<{
    id: string;
    name: string;
    remaining: number;
    amount: string;
    note: string;
  } | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const list = q.data ?? [];

  const submit = () => {
    if (!f) return;
    const a = Number(f.amount);
    if (!f.name.trim() || !(a > 0)) {
      setErr(new Error("اكتب اسم المقاول والمبلغ المتفق عليه"));
      return;
    }
    save.mutate(
      {
        project_id: projectId,
        name: f.name.trim(),
        trade: f.trade.trim() || null,
        phone: f.phone.trim() || null,
        agreed_amount: a,
      },
      { onSuccess: () => setF(null), onError: (e) => setErr(e) },
    );
  };
  const submitPay = () => {
    if (!pay) return;
    const a = Number(pay.amount);
    if (!(a > 0)) {
      setErr(new Error("اكتب مبلغاً أكبر من صفر"));
      return;
    }
    if (a > pay.remaining) {
      setErr(new Error(`المبلغ أكبر من المتبقي (${money(pay.remaining)})`));
      return;
    }
    addPay.mutate(
      { subcontract_id: pay.id, amount: a, note: pay.note.trim() || null },
      { onSuccess: () => setPay(null), onError: (e) => setErr(e) },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold">مقاولو الباطن</h3>
        <Button
          size="sm"
          onClick={() => {
            setF({ name: "", trade: "", phone: "", amount: "" });
            setErr(null);
          }}
        >
          <Plus className="h-4 w-4" /> مقاول
        </Button>
      </div>
      {q.isLoading ? (
        <Spinner />
      ) : !list.length ? (
        <Card>
          <Empty>لا يوجد مقاولو باطن لهذا المشروع.</Empty>
        </Card>
      ) : (
        list.map((s) => {
          const paid = s.payments.reduce((t, p) => t + p.amount, 0);
          const rem = Math.max(0, s.agreed_amount - paid);
          const pct = Math.min(100, Math.round((paid / s.agreed_amount) * 100));
          return (
            <Card key={s.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-extrabold">
                    {s.name}{" "}
                    {s.trade && (
                      <span className="text-sm font-normal text-muted">
                        · {s.trade}
                      </span>
                    )}
                  </div>
                  {s.phone && (
                    <div dir="ltr" className="text-xs text-muted text-end">
                      {s.phone}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {rem === 0 ? (
                    <Badge tone="ok">مسدَّد بالكامل</Badge>
                  ) : (
                    <Badge tone="warn">متبقي {money(rem)}</Badge>
                  )}
                  <Button
                    size="sm"
                    variant="danger"
                    aria-label="حذف المقاول"
                    onClick={() => {
                      if (confirm("حذف المقاول وكل دفعاته؟"))
                        delSub.mutate(s.id, {
                          onError: (e) => toast((e as Error).message, "bad"),
                        });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="num mt-1 flex justify-between text-sm">
                <span>مدفوع {money(paid)}</span>
                <span className="text-muted">من {money(s.agreed_amount)}</span>
              </div>
              {rem > 0 && (
                <div className="mt-3">
                  <Button
                    size="sm"
                    onClick={() => {
                      setPay({
                        id: s.id,
                        name: s.name,
                        remaining: rem,
                        amount: "",
                        note: "",
                      });
                      setErr(null);
                    }}
                  >
                    <Wallet className="h-4 w-4" /> دفعة
                  </Button>
                </div>
              )}
              {!!s.payments.length && (
                <ul className="mt-3 divide-y divide-line text-sm">
                  {s.payments.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between py-1.5"
                    >
                      <span>
                        <b className="num">{money(p.amount)}</b>{" "}
                        <span className="text-muted">
                          · {fmtDate(p.paid_on)}
                          {p.note ? ` · ${p.note}` : ""}
                        </span>
                      </span>
                      <button
                        className="p-1 text-muted hover:text-bad"
                        aria-label="حذف الدفعة"
                        onClick={() => {
                          if (confirm("حذف الدفعة؟")) delPay.mutate(p.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })
      )}

      <Modal
        open={!!f}
        onClose={() => setF(null)}
        title="مقاول باطن جديد"
        footer={
          <>
            <Button variant="secondary" onClick={() => setF(null)}>
              إلغاء
            </Button>
            <Button loading={save.isPending} onClick={submit}>
              حفظ
            </Button>
          </>
        }
      >
        {f && (
          <div className="flex flex-col gap-3">
            <Field label="الاسم">
              <Input
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="التخصص">
                <Input
                  value={f.trade}
                  onChange={(e) => setF({ ...f, trade: e.target.value })}
                  placeholder="سباكة / كهرباء / نجارة"
                />
              </Field>
              <Field label="الهاتف">
                <Input
                  dir="ltr"
                  value={f.phone}
                  onChange={(e) => setF({ ...f, phone: e.target.value })}
                />
              </Field>
            </div>
            <Field label="المبلغ المتفق عليه (ج.م)">
              <Input
                type="number"
                min="0"
                step="any"
                value={f.amount}
                onChange={(e) => setF({ ...f, amount: e.target.value })}
              />
            </Field>
            <ErrorNote error={err} />
          </div>
        )}
      </Modal>

      <Modal
        open={!!pay}
        onClose={() => setPay(null)}
        title={pay ? `دفعة لـ ${pay.name}` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPay(null)}>
              إلغاء
            </Button>
            <Button loading={addPay.isPending} onClick={submitPay}>
              تسجيل
            </Button>
          </>
        }
      >
        {pay && (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg bg-warn-soft p-3 text-sm font-bold text-warn">
              المتبقي: <span className="num">{money(pay.remaining)}</span>
            </div>
            <Field label="المبلغ">
              <Input
                type="number"
                min="0"
                step="any"
                value={pay.amount}
                onChange={(e) => setPay({ ...pay, amount: e.target.value })}
              />
            </Field>
            <button
              className="self-start text-xs font-bold text-brand"
              onClick={() => setPay({ ...pay, amount: String(pay.remaining) })}
            >
              سداد كل المتبقي
            </button>
            <Field label="ملاحظة">
              <Input
                value={pay.note}
                onChange={(e) => setPay({ ...pay, note: e.target.value })}
              />
            </Field>
            <ErrorNote error={err} />
          </div>
        )}
      </Modal>
    </div>
  );
}
