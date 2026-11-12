import { useMemo, useState } from "react";
import { MessageCircle, Plus, Trash2 } from "lucide-react";
import { useProjects } from "@/hooks/useData";
import {
  useDeleteInvoice,
  useSaveSupplier,
  useSupplierInvoices,
  useSuppliers,
  type Supplier,
  type SupplierInvoice,
} from "@/hooks/useExtras";
import {
  useAddPayment,
  useCreateInvoice,
  useDeletePayment,
  useSupplierPayments,
} from "@/hooks/useSupplierPayments";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Textarea,
  useToast,
} from "@/components/ui";
import { Stars } from "@/components/Stars";
import { waNumber } from "@/components/ClientContactCard";
import { fmtDate, money, todayISO } from "@/lib/format";

export default function Suppliers() {
  const toast = useToast();
  const sup = useSuppliers();
  const inv = useSupplierInvoices();
  const projects = useProjects();
  const saveSup = useSaveSupplier();
  const createInv = useCreateInvoice();
  const pays = useSupplierPayments();
  const addPay = useAddPayment();
  const delPay = useDeletePayment();
  const [payFor, setPayFor] = useState<string | null>(null);
  const [pf, setPf] = useState({ amount: "", date: todayISO(), note: "" });
  const delInv = useDeleteInvoice();
  const [edit, setEdit] = useState<
    (Partial<Supplier> & { name: string }) | null
  >(null);
  const [open, setOpen] = useState<Supplier | null>(null);
  const [f, setF] = useState({
    amount: "",
    paid: "0",
    project_id: "",
    date: todayISO(),
    note: "",
  });
  const [err, setErr] = useState<unknown>(null);

  const due = useMemo(() => {
    const m: Record<string, number> = {};
    inv.data?.forEach((i) => {
      m[i.supplier_id] =
        (m[i.supplier_id] ?? 0) + Number(i.amount) - Number(i.paid_amount);
    });
    return m;
  }, [inv.data]);
  const projectName = (id: string | null) =>
    projects.data?.find((p) => p.id === id)?.title ?? "—";

  const submitSup = () => {
    if (!edit?.name.trim()) {
      setErr(new Error("اكتب اسم المورد"));
      return;
    }
    saveSup.mutate(
      { ...edit, name: edit.name.trim() },
      {
        onSuccess: () => {
          setEdit(null);
          setErr(null);
        },
        onError: (e) => setErr(e),
      },
    );
  };
  const submitInv = () => {
    if (!open) return;
    const amount = Number(f.amount),
      paid = Number(f.paid) || 0;
    if (!(amount > 0)) {
      setErr(new Error("اكتب مبلغ الفاتورة"));
      return;
    }
    if (paid > amount) {
      setErr(new Error("المدفوع أكبر من الفاتورة"));
      return;
    }
    createInv.mutate(
      {
        supplier_id: open.id,
        amount,
        firstPayment: paid,
        project_id: f.project_id || null,
        invoice_date: f.date,
        note: f.note.trim() || null,
      },
      {
        onSuccess: () => {
          setF({
            amount: "",
            paid: "0",
            project_id: "",
            date: todayISO(),
            note: "",
          });
          setErr(null);
          toast("تمت إضافة الفاتورة");
        },
        onError: (e) => setErr(e),
      },
    );
  };
  const submitPay = (i: SupplierInvoice) => {
    const amount = Number(pf.amount);
    const left = Number(i.amount) - Number(i.paid_amount);
    if (!(amount > 0)) {
      toast("اكتب مبلغ الدفعة", "bad");
      return;
    }
    if (amount > left) {
      toast(`المبلغ أكبر من المتبقي (${money(left)})`, "bad");
      return;
    }
    addPay.mutate(
      {
        invoice_id: i.id,
        amount,
        paid_on: pf.date,
        note: pf.note.trim() || null,
      },
      {
        onSuccess: () => {
          setPayFor(null);
          setPf({ amount: "", date: todayISO(), note: "" });
          toast("تم تسجيل الدفعة");
        },
        onError: (e) => toast((e as Error).message, "bad"),
      },
    );
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black">الموردون والمقاولون</h1>
        <Button
          onClick={() => {
            setEdit({ name: "", rating: 3 });
            setErr(null);
          }}
        >
          <Plus className="h-4 w-4" /> مورد
        </Button>
      </div>

      {sup.isLoading ? (
        <Spinner />
      ) : sup.error ? (
        <ErrorNote error={sup.error} />
      ) : !sup.data?.length ? (
        <Card>
          <Empty>لا يوجد موردون بعد.</Empty>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sup.data.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-extrabold">{s.name}</div>
                  <div className="text-xs text-muted">{s.trade || "—"}</div>
                </div>
                {s.rating ? <Stars value={s.rating} size="sm" /> : null}
              </div>
              {s.notes && <p className="mt-2 text-xs text-muted">{s.notes}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {due[s.id] > 0 ? (
                  <Badge tone="warn">مستحق {money(due[s.id])}</Badge>
                ) : (
                  <Badge tone="ok">لا مستحقات</Badge>
                )}
                {s.phone && (
                  <a
                    href={`https://wa.me/${waNumber(s.phone)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-brand"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> {s.phone}
                  </a>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setOpen(s);
                    setErr(null);
                  }}
                >
                  الفواتير
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEdit({ ...s });
                    setErr(null);
                  }}
                >
                  تعديل
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "تعديل مورد" : "مورد جديد"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>
              إلغاء
            </Button>
            <Button loading={saveSup.isPending} onClick={submitSup}>
              حفظ
            </Button>
          </>
        }
      >
        {edit && (
          <div className="flex flex-col gap-3">
            <Field label="الاسم">
              <Input
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="التخصص">
                <Input
                  value={edit.trade ?? ""}
                  onChange={(e) => setEdit({ ...edit, trade: e.target.value })}
                  placeholder="كهرباء / سباكة / رخام..."
                />
              </Field>
              <Field label="الهاتف">
                <Input
                  dir="ltr"
                  value={edit.phone ?? ""}
                  onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
                  placeholder="01XXXXXXXXX"
                />
              </Field>
            </div>
            <Field label="التقييم">
              <Select
                value={String(edit.rating ?? 3)}
                onChange={(e) =>
                  setEdit({ ...edit, rating: Number(e.target.value) })
                }
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} / 5
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="ملاحظات">
              <Textarea
                value={edit.notes ?? ""}
                onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                className="min-h-[64px]"
              />
            </Field>
            <ErrorNote error={err} />
          </div>
        )}
      </Modal>

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? `فواتير ${open.name}` : ""}
      >
        {open && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="مبلغ الفاتورة">
                <Input
                  type="number"
                  min="0"
                  value={f.amount}
                  onChange={(e) => setF({ ...f, amount: e.target.value })}
                />
              </Field>
              <Field label="المدفوع حتى الآن (اختياري)">
                <Input
                  type="number"
                  min="0"
                  value={f.paid}
                  onChange={(e) => setF({ ...f, paid: e.target.value })}
                />
              </Field>
              <Field label="المشروع">
                <Select
                  value={f.project_id}
                  onChange={(e) => setF({ ...f, project_id: e.target.value })}
                >
                  <option value="">— بدون —</option>
                  {projects.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="التاريخ">
                <Input
                  type="date"
                  value={f.date}
                  onChange={(e) => setF({ ...f, date: e.target.value })}
                />
              </Field>
            </div>
            <Field label="ملاحظة">
              <Input
                value={f.note}
                onChange={(e) => setF({ ...f, note: e.target.value })}
              />
            </Field>
            <ErrorNote error={err} />
            <Button loading={createInv.isPending} onClick={submitInv}>
              إضافة فاتورة
            </Button>
            <ul className="flex flex-col gap-3 text-sm">
              {inv.data
                ?.filter((i) => i.supplier_id === open.id)
                .map((i) => {
                  const amount = Number(i.amount),
                    paid = Number(i.paid_amount),
                    left = amount - paid;
                  const pct =
                    amount > 0
                      ? Math.min(100, Math.round((paid / amount) * 100))
                      : 0;
                  const history =
                    pays.data?.filter((p) => p.invoice_id === i.id) ?? [];
                  return (
                    <li
                      key={i.id}
                      className="rounded-xl border border-line p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div>
                            فاتورة <b className="num">{money(amount)}</b>
                          </div>
                          <div className="text-xs text-muted">
                            {projectName(i.project_id)} ·{" "}
                            {fmtDate(i.invoice_date)}
                            {i.note ? ` · ${i.note}` : ""}
                          </div>
                        </div>
                        {left <= 0 ? (
                          <Badge tone="ok">مسددة بالكامل</Badge>
                        ) : (
                          <Badge tone="warn">المتبقي {money(left)}</Badge>
                        )}
                      </div>
                      <div
                        className="mt-2 h-2 overflow-hidden rounded-full bg-line"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className="h-full rounded-full bg-ok"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-1 flex justify-between text-xs text-muted">
                        <span>
                          المدفوع <b className="num text-fg">{money(paid)}</b>
                        </span>
                        <span className="num">{pct}%</span>
                      </div>

                      {left > 0 &&
                        (payFor === i.id ? (
                          <div className="mt-3 flex flex-col gap-2 rounded-lg bg-raised p-3">
                            <div className="grid grid-cols-2 gap-2">
                              <Field label="مبلغ الدفعة">
                                <Input
                                  type="number"
                                  min="0"
                                  max={left}
                                  value={pf.amount}
                                  onChange={(e) =>
                                    setPf({ ...pf, amount: e.target.value })
                                  }
                                />
                              </Field>
                              <Field label="التاريخ">
                                <Input
                                  type="date"
                                  value={pf.date}
                                  onChange={(e) =>
                                    setPf({ ...pf, date: e.target.value })
                                  }
                                />
                              </Field>
                            </div>
                            <Input
                              value={pf.note}
                              onChange={(e) =>
                                setPf({ ...pf, note: e.target.value })
                              }
                              placeholder="ملاحظة (اختياري)"
                            />
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                loading={addPay.isPending}
                                onClick={() => submitPay(i)}
                              >
                                حفظ الدفعة
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  setPf({ ...pf, amount: String(left) })
                                }
                              >
                                سداد كل المتبقي
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setPayFor(null)}
                              >
                                إلغاء
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            className="mt-3"
                            onClick={() => {
                              setPayFor(i.id);
                              setPf({ amount: "", date: todayISO(), note: "" });
                            }}
                          >
                            <Plus className="h-4 w-4" /> إضافة دفعة
                          </Button>
                        ))}

                      {!!history.length && (
                        <ul className="mt-3 divide-y divide-line border-t border-line text-xs">
                          {history.map((p) => (
                            <li
                              key={p.id}
                              className="flex items-center justify-between gap-2 py-1.5"
                            >
                              <span>
                                <b className="num">{money(p.amount)}</b> ·{" "}
                                {fmtDate(p.paid_on)}
                                {p.note ? ` · ${p.note}` : ""}
                              </span>
                              <button
                                type="button"
                                aria-label="حذف الدفعة"
                                className="text-muted hover:text-bad"
                                onClick={() => {
                                  if (
                                    confirm(
                                      "حذف هذه الدفعة؟ سيرجع مبلغها إلى المتبقي.",
                                    )
                                  )
                                    delPay.mutate(p.id, {
                                      onError: (e) =>
                                        toast((e as Error).message, "bad"),
                                    });
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-2 text-end">
                        <button
                          type="button"
                          className="text-[11px] text-muted hover:text-bad"
                          onClick={() => {
                            if (confirm("حذف الفاتورة وكل دفعاتها؟"))
                              delInv.mutate(i.id, {
                                onError: (e) =>
                                  toast((e as Error).message, "bad"),
                              });
                          }}
                        >
                          حذف الفاتورة
                        </button>
                      </div>
                    </li>
                  );
                })}
            </ul>
          </div>
        )}
      </Modal>
    </div>
  );
}
