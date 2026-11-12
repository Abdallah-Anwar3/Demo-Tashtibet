import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Plus, Trash2 } from "lucide-react";
import {
  useBoq,
  useBoqSummary,
  useCreateQuote,
  useDeleteBoq,
  useSaveBoq,
  type BoqItem,
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
  Select,
  Spinner,
  Table,
  Td,
  Th,
  useToast,
} from "@/components/ui";
import { CATEGORY_LABEL } from "@/lib/labels";
import { money, num } from "@/lib/format";
import type { ExpenseCategory } from "@/lib/types";

const CATS = Object.keys(CATEGORY_LABEL) as ExpenseCategory[];
const blank = {
  category: "materials" as ExpenseCategory,
  title: "",
  unit: "م²",
  qty: "",
  unit_price: "",
};

/** مقايسة المشروع: المقدَّر ↔ المنفَّذ (الكمية المنجزة × السعر) ↔ الفعلي (مصروفات معتمدة). */
export function BoqPanel({
  projectId,
  clientName,
}: {
  projectId: string;
  clientName: string;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const items = useBoq(projectId);
  const summary = useBoqSummary(projectId);
  const save = useSaveBoq();
  const del = useDeleteBoq();
  const createQuote = useCreateQuote();
  const [f, setF] = useState<typeof blank | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const list = items.data ?? [];
  const sums = summary.data ?? [];
  const planned = sums.reduce((s, x) => s + x.planned, 0);
  const executed = sums.reduce((s, x) => s + x.executed, 0);
  const actual = sums.reduce((s, x) => s + x.actual, 0);

  const setDone = (b: BoqItem, v: string) => {
    const d = Number(v);
    if (!Number.isFinite(d) || d < 0 || d > b.qty) {
      toast("الكمية المنجزة بين 0 والكمية الكلية", "bad");
      return;
    }
    if (d === b.done_qty) return;
    save.mutate(
      { id: b.id, project_id: projectId, done_qty: d },
      { onError: (e) => toast((e as Error).message, "bad") },
    );
  };

  const submit = () => {
    if (!f) return;
    const qty = Number(f.qty),
      price = Number(f.unit_price);
    if (!f.title.trim() || !(qty > 0) || !(price >= 0)) {
      setErr(new Error("اكتب البند والكمية والسعر"));
      return;
    }
    save.mutate(
      {
        project_id: projectId,
        category: f.category,
        title: f.title.trim(),
        unit: f.unit.trim() || "وحدة",
        qty,
        unit_price: price,
      },
      { onSuccess: () => setF(null), onError: (e) => setErr(e) },
    );
  };

  const makeQuote = () => {
    createQuote.mutate(
      {
        quote: {
          client_name: clientName,
          project_id: projectId,
          kind: "quote",
        },
        items: list.map((b) => ({
          description: b.title,
          unit: b.unit,
          qty: b.qty,
          unit_price: b.unit_price,
        })),
      },
      {
        onSuccess: (id) => navigate(`/admin/quotes?open=${id}`),
        onError: (e) => toast((e as Error).message, "bad"),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h3 className="mb-3 font-extrabold">المقدَّر مقابل المنفَّذ والفعلي</h3>
        {summary.isLoading ? (
          <Spinner />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-xs text-muted">المقدَّر (المقايسة)</div>
                <div className="num font-black">{money(planned)}</div>
              </div>
              <div>
                <div className="text-xs text-muted">المنفَّذ (قيمة المنجز)</div>
                <div className="num font-black">{money(executed)}</div>
              </div>
              <div>
                <div className="text-xs text-muted">الفعلي (مصروف معتمد)</div>
                <div className="num font-black">{money(actual)}</div>
              </div>
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>النوع</Th>
                  <Th>مقدَّر</Th>
                  <Th>منفَّذ</Th>
                  <Th>فعلي</Th>
                  <Th>الفرق</Th>
                </tr>
              </thead>
              <tbody>
                {sums
                  .filter((s) => s.planned > 0 || s.actual > 0)
                  .map((s) => {
                    const over = s.actual > s.executed && s.actual > 0;
                    return (
                      <tr key={s.cat}>
                        <Td className="font-bold">{CATEGORY_LABEL[s.cat]}</Td>
                        <Td className="num">{money(s.planned)}</Td>
                        <Td className="num">{money(s.executed)}</Td>
                        <Td className="num">{money(s.actual)}</Td>
                        <Td>
                          {over ? (
                            <Badge tone="bad">
                              صرف أعلى من المنجز بـ{" "}
                              {money(s.actual - s.executed)}
                            </Badge>
                          ) : (
                            <Badge tone="ok">ضمن المنجز</Badge>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
              </tbody>
            </Table>
            <p className="mt-2 text-[11px] text-muted">
              «الفرق» يقارن ما صُرف فعلاً بقيمة ما أُنجز من المقايسة. صرف أعلى
              من المنجز يعني أن التكلفة تسبق التنفيذ أو أن السعر الفعلي أعلى من
              المقدَّر.
            </p>
          </>
        )}
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-extrabold">بنود المقايسة</h3>
          <div className="flex gap-2">
            {!!list.length && (
              <Button
                size="sm"
                variant="secondary"
                loading={createQuote.isPending}
                onClick={makeQuote}
              >
                <FileText className="h-4 w-4" /> عرض سعر من المقايسة
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                setF(blank);
                setErr(null);
              }}
            >
              <Plus className="h-4 w-4" /> بند
            </Button>
          </div>
        </div>
        {items.isLoading ? (
          <Spinner />
        ) : !list.length ? (
          <Empty>
            لا توجد بنود. أضف بنود المقايسة بالكمية والسعر لتبدأ المقارنة.
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>البند</Th>
                <Th>النوع</Th>
                <Th>الكمية</Th>
                <Th>السعر</Th>
                <Th>الإجمالي</Th>
                <Th>المنجز</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.id}>
                  <Td className="font-bold">
                    {b.title}{" "}
                    <span className="text-[11px] font-normal text-muted">
                      ({b.unit})
                    </span>
                  </Td>
                  <Td>{CATEGORY_LABEL[b.category]}</Td>
                  <Td className="num">{num(b.qty)}</Td>
                  <Td className="num">{money(b.unit_price)}</Td>
                  <Td className="num">{money(b.qty * b.unit_price)}</Td>
                  <Td>
                    <Input
                      key={b.id + b.done_qty}
                      className="num w-24"
                      type="number"
                      min="0"
                      max={b.qty}
                      step="any"
                      defaultValue={b.done_qty}
                      aria-label={`المنجز من ${b.title}`}
                      onBlur={(e) => setDone(b, e.target.value)}
                    />
                  </Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="danger"
                      aria-label="حذف"
                      onClick={() => {
                        if (confirm("حذف البند؟")) del.mutate(b.id);
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
        title="بند مقايسة"
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
            <Field label="البند">
              <Input
                value={f.title}
                onChange={(e) => setF({ ...f, title: e.target.value })}
                placeholder="مثال: توريد وتركيب سيراميك أرضيات"
              />
            </Field>
            <Field label="النوع" hint="يُقارن بنفس نوع المصروفات المعتمدة">
              <Select
                value={f.category}
                onChange={(e) =>
                  setF({ ...f, category: e.target.value as ExpenseCategory })
                }
              >
                {CATS.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="الوحدة">
                <Input
                  value={f.unit}
                  onChange={(e) => setF({ ...f, unit: e.target.value })}
                />
              </Field>
              <Field label="الكمية">
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={f.qty}
                  onChange={(e) => setF({ ...f, qty: e.target.value })}
                />
              </Field>
              <Field label="سعر الوحدة">
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={f.unit_price}
                  onChange={(e) => setF({ ...f, unit_price: e.target.value })}
                />
              </Field>
            </div>
            <ErrorNote error={err} />
          </div>
        )}
      </Modal>
    </div>
  );
}
