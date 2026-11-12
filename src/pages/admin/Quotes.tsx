import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, Plus, Printer, Trash2 } from "lucide-react";
import {
  quoteTotals,
  useCreateQuote,
  useDeleteQuote,
  useDeleteQuoteItem,
  useQuote,
  useQuotes,
  useSaveQuoteItem,
  useUpdateQuote,
  type Quote,
} from "@/hooks/useBusiness";
import { useProjects } from "@/hooks/useData";
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
  Table,
  Td,
  Textarea,
  Th,
  useToast,
} from "@/components/ui";
import { fmtDate, money, todayISO } from "@/lib/format";

const STATUS: Record<
  Quote["status"],
  { label: string; tone: "gray" | "info" | "ok" | "bad" }
> = {
  draft: { label: "مسودة", tone: "gray" },
  sent: { label: "أُرسل", tone: "info" },
  accepted: { label: "مقبول", tone: "ok" },
  rejected: { label: "مرفوض", tone: "bad" },
  paid: { label: "مدفوعة", tone: "ok" },
};
const KIND = { quote: "عرض سعر", invoice: "فاتورة" } as const;

/** عروض الأسعار والفواتير: إنشاء، تعديل البنود، وطباعة/حفظ PDF باسم الشركة. */
export default function Quotes() {
  const [params, setParams] = useSearchParams();
  const open = params.get("open");
  return open ? (
    <QuoteEditor id={open} onBack={() => setParams({})} />
  ) : (
    <QuoteList onOpen={(id) => setParams({ open: id })} />
  );
}

function QuoteList({ onOpen }: { onOpen: (id: string) => void }) {
  const q = useQuotes();
  const projects = useProjects();
  const create = useCreateQuote();
  const del = useDeleteQuote();
  const toast = useToast();
  const [f, setF] = useState<{
    kind: "quote" | "invoice";
    client_name: string;
    client_phone: string;
    project_id: string;
  } | null>(null);
  const [err, setErr] = useState<unknown>(null);

  const submit = () => {
    if (!f?.client_name.trim()) {
      setErr(new Error("اكتب اسم العميل"));
      return;
    }
    create.mutate(
      {
        quote: {
          kind: f.kind,
          client_name: f.client_name.trim(),
          client_phone: f.client_phone.trim() || null,
          project_id: f.project_id || null,
        },
      },
      {
        onSuccess: (id) => {
          setF(null);
          onOpen(id);
        },
        onError: (e) => setErr(e),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black">عروض الأسعار والفواتير</h1>
        <Button
          onClick={() => {
            setF({
              kind: "quote",
              client_name: "",
              client_phone: "",
              project_id: "",
            });
            setErr(null);
          }}
        >
          <Plus className="h-4 w-4" /> جديد
        </Button>
      </div>
      <Card>
        {q.isLoading ? (
          <Spinner />
        ) : !q.data?.length ? (
          <Empty>
            لا توجد عروض بعد. أنشئ عرض سعر أو فاتورة، أو ولّد عرضاً من مقايسة
            مشروع.
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>الرقم</Th>
                <Th>النوع</Th>
                <Th>العميل</Th>
                <Th>التاريخ</Th>
                <Th>الحالة</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {q.data.map((x) => (
                <tr key={x.id} className="hover:bg-raised">
                  <Td>
                    <button
                      className="num font-bold text-brand"
                      onClick={() => onOpen(x.id)}
                    >
                      {x.number}
                    </button>
                  </Td>
                  <Td>{KIND[x.kind]}</Td>
                  <Td>{x.client_name}</Td>
                  <Td>{fmtDate(x.issue_date)}</Td>
                  <Td>
                    <Badge tone={STATUS[x.status].tone}>
                      {STATUS[x.status].label}
                    </Badge>
                  </Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="danger"
                      aria-label="حذف"
                      onClick={() => {
                        if (confirm("حذف هذا المستند؟"))
                          del.mutate(x.id, {
                            onError: (e) => toast((e as Error).message, "bad"),
                          });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={!!f}
        onClose={() => setF(null)}
        title="مستند جديد"
        footer={
          <>
            <Button variant="secondary" onClick={() => setF(null)}>
              إلغاء
            </Button>
            <Button loading={create.isPending} onClick={submit}>
              إنشاء
            </Button>
          </>
        }
      >
        {f && (
          <div className="flex flex-col gap-3">
            <Field label="النوع">
              <Select
                value={f.kind}
                onChange={(e) =>
                  setF({ ...f, kind: e.target.value as "quote" | "invoice" })
                }
              >
                <option value="quote">عرض سعر</option>
                <option value="invoice">فاتورة</option>
              </Select>
            </Field>
            <Field label="اسم العميل">
              <Input
                value={f.client_name}
                onChange={(e) => setF({ ...f, client_name: e.target.value })}
              />
            </Field>
            <Field label="هاتف العميل (اختياري)">
              <Input
                dir="ltr"
                value={f.client_phone}
                onChange={(e) => setF({ ...f, client_phone: e.target.value })}
              />
            </Field>
            <Field label="المشروع (اختياري)">
              <Select
                value={f.project_id}
                onChange={(e) => {
                  const p = projects.data?.find((x) => x.id === e.target.value);
                  setF({
                    ...f,
                    project_id: e.target.value,
                    client_name: f.client_name || p?.client_name || "",
                  });
                }}
              >
                <option value="">— بدون —</option>
                {projects.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
            </Field>
            <ErrorNote error={err} />
          </div>
        )}
      </Modal>
    </div>
  );
}

function QuoteEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const toast = useToast();
  const q = useQuote(id);
  const update = useUpdateQuote();
  const saveItem = useSaveQuoteItem();
  const delItem = useDeleteQuoteItem();
  const [h, setH] = useState<Pick<
    Quote,
    | "client_name"
    | "client_phone"
    | "issue_date"
    | "valid_until"
    | "discount"
    | "tax_pct"
    | "notes"
    | "status"
  > | null>(null);
  const [item, setItem] = useState({
    description: "",
    unit: "وحدة",
    qty: "",
    unit_price: "",
  });
  const [err, setErr] = useState<unknown>(null);

  useEffect(() => {
    if (q.data) {
      const x = q.data.quote;
      setH({
        client_name: x.client_name,
        client_phone: x.client_phone,
        issue_date: x.issue_date,
        valid_until: x.valid_until,
        discount: x.discount,
        tax_pct: x.tax_pct,
        notes: x.notes,
        status: x.status,
      });
    }
  }, [q.data?.quote.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isLoading || !h) return <Spinner />;
  if (!q.data)
    return (
      <Card>
        <Empty>المستند غير موجود.</Empty>
      </Card>
    );
  const { quote, items } = q.data;
  const t = quoteTotals(items, Number(h.discount) || 0, Number(h.tax_pct) || 0);

  const saveHead = () =>
    update.mutate(
      {
        id,
        patch: {
          client_name: h.client_name.trim() || quote.client_name,
          client_phone: h.client_phone?.trim() || null,
          issue_date: h.issue_date || todayISO(),
          valid_until: h.valid_until || null,
          discount: Number(h.discount) || 0,
          tax_pct: Number(h.tax_pct) || 0,
          notes: h.notes?.trim() || null,
          status: h.status,
        },
      },
      { onSuccess: () => toast("تم الحفظ"), onError: (e) => setErr(e) },
    );

  const addItem = () => {
    const qty = Number(item.qty),
      price = Number(item.unit_price);
    if (!item.description.trim() || !(qty > 0) || !(price >= 0)) {
      setErr(new Error("اكتب الوصف والكمية والسعر"));
      return;
    }
    saveItem.mutate(
      {
        quote_id: id,
        description: item.description.trim(),
        unit: item.unit.trim() || "وحدة",
        qty,
        unit_price: price,
        sort: items.length,
      },
      {
        onSuccess: () => {
          setItem({ description: "", unit: "وحدة", qty: "", unit_price: "" });
          setErr(null);
        },
        onError: (e) => setErr(e),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm font-bold text-muted hover:text-fg"
        >
          <ArrowRight className="h-4 w-4" /> القائمة
        </button>
        <div className="flex items-center gap-2">
          <Badge tone={STATUS[quote.status].tone}>
            {KIND[quote.kind]} {quote.number}
          </Badge>
          <a
            href={`/admin-print/quote/${id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-dark"
          >
            <Printer className="h-4 w-4" /> طباعة / PDF
          </a>
        </div>
      </div>

      <Card className="p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="العميل">
            <Input
              value={h.client_name}
              onChange={(e) => setH({ ...h, client_name: e.target.value })}
            />
          </Field>
          <Field label="هاتف العميل">
            <Input
              dir="ltr"
              value={h.client_phone ?? ""}
              onChange={(e) => setH({ ...h, client_phone: e.target.value })}
            />
          </Field>
          <Field label="تاريخ الإصدار">
            <Input
              type="date"
              value={h.issue_date}
              onChange={(e) => setH({ ...h, issue_date: e.target.value })}
            />
          </Field>
          <Field
            label={quote.kind === "quote" ? "صالح حتى" : "تاريخ الاستحقاق"}
          >
            <Input
              type="date"
              value={h.valid_until ?? ""}
              onChange={(e) => setH({ ...h, valid_until: e.target.value })}
            />
          </Field>
          <Field label="خصم (مبلغ)">
            <Input
              type="number"
              min="0"
              step="any"
              value={h.discount}
              onChange={(e) => setH({ ...h, discount: Number(e.target.value) })}
            />
          </Field>
          <Field label="ضريبة %" hint="0 إن لم تكن مطلوبة">
            <Input
              type="number"
              min="0"
              max="100"
              step="any"
              value={h.tax_pct}
              onChange={(e) => setH({ ...h, tax_pct: Number(e.target.value) })}
            />
          </Field>
          <Field label="الحالة">
            <Select
              value={h.status}
              onChange={(e) =>
                setH({ ...h, status: e.target.value as Quote["status"] })
              }
            >
              {(Object.keys(STATUS) as Quote["status"][]).map((s) => (
                <option key={s} value={s}>
                  {STATUS[s].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="ملاحظات وشروط (تظهر في الطباعة)" className="mt-3">
          <Textarea
            rows={3}
            value={h.notes ?? ""}
            onChange={(e) => setH({ ...h, notes: e.target.value })}
          />
        </Field>
        <div className="mt-3 flex justify-end">
          <Button loading={update.isPending} onClick={saveHead}>
            حفظ البيانات
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 font-extrabold">البنود</h3>
        {!items.length ? (
          <Empty>لا توجد بنود بعد.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>الوصف</Th>
                <Th>الوحدة</Th>
                <Th>الكمية</Th>
                <Th>السعر</Th>
                <Th>الإجمالي</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id}>
                  <Td className="font-bold">{x.description}</Td>
                  <Td>{x.unit}</Td>
                  <Td className="num">{x.qty}</Td>
                  <Td className="num">{money(x.unit_price)}</Td>
                  <Td className="num">{money(x.qty * x.unit_price)}</Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="danger"
                      aria-label="حذف البند"
                      onClick={() => delItem.mutate(x.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <div className="mt-4 grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
          <Input
            placeholder="وصف البند"
            value={item.description}
            onChange={(e) => setItem({ ...item, description: e.target.value })}
          />
          <Input
            placeholder="الوحدة"
            value={item.unit}
            onChange={(e) => setItem({ ...item, unit: e.target.value })}
          />
          <Input
            type="number"
            min="0"
            step="any"
            placeholder="الكمية"
            value={item.qty}
            onChange={(e) => setItem({ ...item, qty: e.target.value })}
          />
          <Input
            type="number"
            min="0"
            step="any"
            placeholder="السعر"
            value={item.unit_price}
            onChange={(e) => setItem({ ...item, unit_price: e.target.value })}
          />
          <Button loading={saveItem.isPending} onClick={addItem}>
            <Plus className="h-4 w-4" /> إضافة
          </Button>
        </div>
        <div className="mt-3">
          <ErrorNote error={err} />
        </div>
        <dl className="mt-4 ms-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">المجموع</dt>
            <dd className="num">{money(t.sub)}</dd>
          </div>
          {t.sub - t.afterDiscount > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">الخصم</dt>
              <dd className="num">- {money(t.sub - t.afterDiscount)}</dd>
            </div>
          )}
          {t.tax > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">الضريبة</dt>
              <dd className="num">{money(t.tax)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-line pt-1 text-base font-black">
            <dt>الإجمالي</dt>
            <dd className="num">{money(t.total)}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
