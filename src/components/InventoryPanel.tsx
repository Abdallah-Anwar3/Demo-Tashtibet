import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Plus, Trash2 } from "lucide-react";
import {
  useAddMaterial,
  useAddMove,
  useMaterials,
  useStockMoves,
  type MaterialStock,
} from "@/hooks/useExtras";
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
  Table,
  Td,
  Th,
  useToast,
} from "@/components/ui";
import { fmtDate } from "@/lib/format";

const KIND = { in: "وارد", out: "صرف", waste: "هالك" } as const;

/** Materials of one project: balance, add stock, issue stock, record waste. */
export function InventoryPanel({ projectId }: { projectId: string }) {
  const toast = useToast();
  const q = useMaterials(projectId);
  const addMat = useAddMaterial();
  const addMove = useAddMove();
  const [mat, setMat] = useState<{
    name: string;
    unit: string;
    min_qty: string;
  } | null>(null);
  const [move, setMove] = useState<{
    m: MaterialStock;
    kind: "in" | "out" | "waste";
    qty: string;
    note: string;
  } | null>(null);
  const [hist, setHist] = useState<MaterialStock | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const list = q.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-extrabold">مخزون الخامات</h3>
          <Button
            size="sm"
            onClick={() => {
              setMat({ name: "", unit: "قطعة", min_qty: "0" });
              setErr(null);
            }}
          >
            <Plus className="h-4 w-4" /> خامة
          </Button>
        </div>
        {q.isLoading ? (
          <Spinner />
        ) : !list.length ? (
          <Empty>لا توجد خامات. أضف خامة ثم سجّل الوارد والمصروف.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>الخامة</Th>
                <Th>وارد</Th>
                <Th>صرف</Th>
                <Th>هالك</Th>
                <Th>الرصيد</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {list.map((m) => {
                const low =
                  Number(m.min_qty) > 0 &&
                  Number(m.balance) <= Number(m.min_qty);
                return (
                  <tr key={m.id}>
                    <Td>
                      <button
                        className="font-bold text-brand"
                        onClick={() => setHist(m)}
                      >
                        {m.name}
                      </button>{" "}
                      <span className="text-[11px] text-muted">({m.unit})</span>
                    </Td>
                    <Td className="num">{Number(m.qty_in)}</Td>
                    <Td className="num">{Number(m.qty_out)}</Td>
                    <Td className="num">{Number(m.qty_waste)}</Td>
                    <Td className="num">
                      <b>{Number(m.balance)}</b>{" "}
                      {low && <Badge tone="bad">منخفض</Badge>}
                    </Td>
                    <Td>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ok"
                          onClick={() => {
                            setMove({ m, kind: "in", qty: "", note: "" });
                            setErr(null);
                          }}
                        >
                          <ArrowDownToLine className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setMove({ m, kind: "out", qty: "", note: "" });
                            setErr(null);
                          }}
                        >
                          <ArrowUpFromLine className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          aria-label="هالك"
                          onClick={() => {
                            setMove({ m, kind: "waste", qty: "", note: "" });
                            setErr(null);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <p className="mt-2 text-[11px] text-muted">
          الأسهم: ↓ وارد، ↑ صرف للموقع، سلة = هالك. لا يُسمح بصرف أكثر من
          الرصيد.
        </p>
      </Card>

      <Modal
        open={!!mat}
        onClose={() => setMat(null)}
        title="خامة جديدة"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMat(null)}>
              إلغاء
            </Button>
            <Button
              loading={addMat.isPending}
              onClick={() => {
                if (!mat?.name.trim()) {
                  setErr(new Error("اكتب اسم الخامة"));
                  return;
                }
                addMat.mutate(
                  {
                    project_id: projectId,
                    name: mat.name.trim(),
                    unit: mat.unit.trim() || "قطعة",
                    min_qty: Number(mat.min_qty) || 0,
                  },
                  { onSuccess: () => setMat(null), onError: (e) => setErr(e) },
                );
              }}
            >
              حفظ
            </Button>
          </>
        }
      >
        {mat && (
          <div className="flex flex-col gap-3">
            <Field label="الاسم">
              <Input
                value={mat.name}
                onChange={(e) => setMat({ ...mat, name: e.target.value })}
                placeholder="مثال: سيراميك 60×60"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="الوحدة">
                <Input
                  value={mat.unit}
                  onChange={(e) => setMat({ ...mat, unit: e.target.value })}
                  placeholder="م² / كيس / قطعة"
                />
              </Field>
              <Field label="حد التنبيه" hint="تنبيه عند الوصول له (0 = بدون)">
                <Input
                  type="number"
                  min="0"
                  value={mat.min_qty}
                  onChange={(e) => setMat({ ...mat, min_qty: e.target.value })}
                />
              </Field>
            </div>
            <ErrorNote error={err} />
          </div>
        )}
      </Modal>

      <Modal
        open={!!move}
        onClose={() => setMove(null)}
        title={move ? `${KIND[move.kind]} — ${move.m.name}` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMove(null)}>
              إلغاء
            </Button>
            <Button
              loading={addMove.isPending}
              onClick={() => {
                if (!move) return;
                const qty = Number(move.qty);
                if (!(qty > 0)) {
                  setErr(new Error("اكتب كمية أكبر من صفر"));
                  return;
                }
                addMove.mutate(
                  {
                    material_id: move.m.id,
                    kind: move.kind,
                    qty,
                    note: move.note.trim() || null,
                  },
                  {
                    onSuccess: () => {
                      setMove(null);
                      toast("تم التسجيل");
                    },
                    onError: (e) => setErr(e),
                  },
                );
              }}
            >
              تسجيل
            </Button>
          </>
        }
      >
        {move && (
          <div className="flex flex-col gap-3">
            <div className="text-xs text-muted">
              الرصيد الحالي: <b className="num">{Number(move.m.balance)}</b>{" "}
              {move.m.unit}
            </div>
            <Field label={`الكمية (${move.m.unit})`}>
              <Input
                type="number"
                min="0"
                step="any"
                value={move.qty}
                onChange={(e) => setMove({ ...move, qty: e.target.value })}
              />
            </Field>
            <Field label="ملاحظة (اختياري)">
              <Input
                value={move.note}
                onChange={(e) => setMove({ ...move, note: e.target.value })}
              />
            </Field>
            <ErrorNote error={err} />
          </div>
        )}
      </Modal>

      {hist && <History m={hist} onClose={() => setHist(null)} />}
    </div>
  );
}

function History({ m, onClose }: { m: MaterialStock; onClose: () => void }) {
  const q = useStockMoves(m.id);
  return (
    <Modal open onClose={onClose} title={`حركة ${m.name}`}>
      {q.isLoading ? (
        <Spinner />
      ) : !q.data?.length ? (
        <Empty>لا توجد حركة.</Empty>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {q.data.map((x) => (
            <li key={x.id} className="flex items-center justify-between py-2">
              <span>
                <Badge
                  tone={
                    x.kind === "in" ? "ok" : x.kind === "waste" ? "bad" : "gray"
                  }
                >
                  {KIND[x.kind]}
                </Badge>{" "}
                <span className="num font-bold">{Number(x.qty)}</span> {m.unit}
                {x.note && (
                  <span className="ms-2 text-xs text-muted">{x.note}</span>
                )}
              </span>
              <span className="num text-xs text-muted">
                {fmtDate(x.moved_on)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
