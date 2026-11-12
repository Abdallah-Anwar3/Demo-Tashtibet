import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Receipt, Undo2, Wallet } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useExpenses, useMyWallet, useProjects } from "@/hooks/useData";
import { useAddReturn, useReturns } from "@/hooks/useReturns";
import { localDB } from "@/lib/db";
import { compressImage } from "@/lib/imageUtils";
import { CATEGORY_LABEL, EXPENSE_STATUS_LABEL } from "@/lib/labels";
import { fmtDate, money } from "@/lib/format";
import { newId } from "@/lib/utils";
import type { ExpenseCategory, ExpenseStatus } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";

const STATUS_TONE: Record<ExpenseStatus, "ok" | "warn" | "bad"> = {
  approved: "ok",
  pending_review: "warn",
  rejected: "bad",
};

export default function EngExpenses() {
  const { profile } = useAuth();
  const toast = useToast();
  const { sync } = useOfflineSync();
  const wallet = useMyWallet(profile?.id);
  const projects = useProjects();
  const history = useExpenses({ engineerId: profile?.id });
  const queued =
    useLiveQuery(
      () =>
        localDB.pendingExpenses
          .where("syncStatus")
          .anyOf("pending", "failed")
          .toArray(),
      [],
    ) ?? [];

  const [f, setF] = useState({
    projectId: "",
    amount: "",
    category: "" as ExpenseCategory | "",
    description: "",
  });
  const [receipt, setReceipt] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);

  const [mode, setMode] = useState<"expense" | "return">("expense");
  const returns = useReturns({ engineerId: profile?.id, limit: 15 });
  const addReturn = useAddReturn();
  const [r, setR] = useState({ projectId: "", amount: "", description: "" });
  const [rReceipt, setRReceipt] = useState<Blob | null>(null);
  const rAmount = Number(r.amount);
  const submitReturn = () => {
    if (!profile) return;
    if (!r.projectId || !r.description.trim() || !(rAmount > 0)) {
      toast("أكمل جميع الحقول المطلوبة", "bad");
      return;
    }
    if (!navigator.onLine) {
      toast("تسجيل المرتجع يحتاج اتصالاً بالإنترنت", "bad");
      return;
    }
    addReturn.mutate(
      {
        engineerId: profile.id,
        projectId: r.projectId,
        amount: rAmount,
        description: r.description.trim(),
        receipt: rReceipt,
      },
      {
        onSuccess: () => {
          setR({ ...r, amount: "", description: "" });
          setRReceipt(null);
          toast("تم تسجيل المرتجع وإضافته للعهدة بانتظار اعتماد المدير");
        },
        onError: (e) => toast((e as Error).message, "bad"),
      },
    );
  };

  const queuedTotal = queued.reduce((s, x) => s + x.amount, 0);
  const available = Number(wallet.data?.current_balance ?? 0) - queuedTotal;
  const amount = Number(f.amount);

  const submit = async () => {
    if (!profile) return;
    if (!f.projectId || !f.category || !f.description.trim() || !(amount > 0)) {
      toast("أكمل جميع الحقول المطلوبة", "bad");
      return;
    }
    if (amount > available) {
      toast("المبلغ أكبر من رصيد العهدة المتاح", "bad");
      return;
    }
    setBusy(true);
    try {
      await localDB.pendingExpenses.add({
        offlineId: newId(),
        projectId: f.projectId,
        engineerId: profile.id,
        amount,
        category: f.category,
        description: f.description.trim(),
        receipt: receipt ?? undefined,
        syncStatus: "pending",
        createdAt: new Date().toISOString(),
      });
      setF({ ...f, amount: "", category: "", description: "" });
      setReceipt(null);
      toast("تم تسجيل المصروف وخصمه من العهدة");
      void sync();
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="rounded-2xl bg-gradient-to-br from-[#1a1a3e] to-[#2d1b69] p-5 text-white">
        <div className="flex items-center gap-2 text-xs font-semibold opacity-70">
          <Wallet className="h-4 w-4" /> رصيد العهدة المتاح
        </div>
        <div className="num mt-1 text-4xl font-black">{money(available)}</div>
        {queuedTotal > 0 && (
          <div className="mt-1 text-[11px] opacity-70">
            منها {money(queuedTotal)} بانتظار الرفع
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl bg-raised p-1 text-sm font-bold">
        <button
          onClick={() => setMode("expense")}
          className={`rounded-lg py-2 ${mode === "expense" ? "bg-card shadow" : "text-muted"}`}
        >
          مصروف
        </button>
        <button
          onClick={() => setMode("return")}
          className={`rounded-lg py-2 ${mode === "return" ? "bg-card shadow" : "text-muted"}`}
        >
          مرتجع للعهدة
        </button>
      </div>

      {mode === "return" && (
        <Card className="flex flex-col gap-4 p-4">
          <h2 className="font-extrabold">تسجيل مرتجع للعهدة</h2>
          <p className="text-xs text-muted">
            مبلغ رجع لك (مثل استرداد خامات). يُضاف لرصيد عهدتك فوراً، ويعتمده
            المدير أو يرفضه، وعند الرفض يُخصم من رصيدك.
          </p>
          <Field label="الموقع التابع له *">
            <Select
              value={r.projectId}
              onChange={(e) => setR({ ...r, projectId: e.target.value })}
            >
              <option value="">— اختر —</option>
              {projects.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="مبلغ المرتجع *">
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              dir="ltr"
              value={r.amount}
              onChange={(e) => setR({ ...r, amount: e.target.value })}
              className="num text-lg font-extrabold"
              placeholder="0.00"
            />
          </Field>
          <Field label="السبب / التفاصيل *">
            <Textarea
              value={r.description}
              onChange={(e) => setR({ ...r, description: e.target.value })}
              className="min-h-[64px]"
            />
          </Field>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-line p-3 text-sm font-bold text-muted hover:border-brand hover:text-brand">
            <Receipt className="h-5 w-5" />
            {rReceipt
              ? "تم إرفاق الإيصال ✓ (اضغط للتغيير)"
              : "صورة إيصال المرتجع (اختياري)"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={async (e) => {
                const x = e.target.files?.[0];
                e.target.value = "";
                if (x) setRReceipt(await compressImage(x));
              }}
            />
          </label>
          <Button
            size="lg"
            loading={addReturn.isPending}
            onClick={submitReturn}
          >
            <Undo2 className="h-5 w-5" /> تسجيل المرتجع
          </Button>
          <h3 className="text-sm font-extrabold">آخر مرتجعاتي</h3>
          <ul className="divide-y divide-line">
            {returns.data?.map((x) => (
              <li
                key={x.id}
                className="flex items-center justify-between gap-2 py-2.5 text-sm"
              >
                <div>
                  <div className="font-bold">مرتجع</div>
                  <div className="text-xs text-muted">
                    {fmtDate(x.created_at)} · {x.description}
                  </div>
                </div>
                <div className="text-end">
                  <div className="num font-extrabold text-ok">
                    +{money(x.amount)}
                  </div>
                  <Badge tone={STATUS_TONE[x.status]}>
                    {EXPENSE_STATUS_LABEL[x.status]}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
          {!returns.data?.length && (
            <div className="py-2 text-center text-sm text-muted">
              لا توجد مرتجعات بعد.
            </div>
          )}
        </Card>
      )}

      {mode === "expense" && (
        <>
          <Card className="flex flex-col gap-4 p-4">
            <h2 className="font-extrabold">تسجيل مصروف جديد</h2>
            <Field label="الموقع التابع له *">
              <Select
                value={f.projectId}
                onChange={(e) => setF({ ...f, projectId: e.target.value })}
              >
                <option value="">— اختر —</option>
                {projects.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="المبلغ المصروف *">
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  dir="ltr"
                  value={f.amount}
                  onChange={(e) => setF({ ...f, amount: e.target.value })}
                  className="num text-lg font-extrabold"
                  placeholder="0.00"
                />
              </Field>
              <Field label="الفئة *">
                <Select
                  value={f.category}
                  onChange={(e) =>
                    setF({ ...f, category: e.target.value as ExpenseCategory })
                  }
                >
                  <option value="">— اختر —</option>
                  {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="تفاصيل البند *">
              <Textarea
                value={f.description}
                onChange={(e) => setF({ ...f, description: e.target.value })}
                className="min-h-[64px]"
              />
            </Field>
            <div>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-line p-3 text-sm font-bold text-muted hover:border-brand hover:text-brand">
                <Receipt className="h-5 w-5" />
                {receipt
                  ? "تم إرفاق الإيصال ✓ (اضغط للتغيير)"
                  : "صورة الفاتورة / إيصال الاستلام"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={async (e) => {
                    const x = e.target.files?.[0];
                    e.target.value = "";
                    if (x) setReceipt(await compressImage(x));
                  }}
                />
              </label>
            </div>
            <Button size="lg" loading={busy} onClick={submit}>
              <Plus className="h-5 w-5" /> تسجيل المصروف
            </Button>
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-extrabold">آخر مصروفاتي</h3>
            <ul className="divide-y divide-line">
              {queued.map((x) => (
                <li
                  key={x.offlineId}
                  className="flex items-center justify-between gap-2 py-2.5 text-sm"
                >
                  <div>
                    <div className="font-bold">
                      {CATEGORY_LABEL[x.category as ExpenseCategory]}
                    </div>
                    <div className="text-xs text-muted">{x.description}</div>
                  </div>
                  <div className="text-end">
                    <div className="num font-extrabold">{money(x.amount)}</div>
                    <Badge tone={x.syncStatus === "failed" ? "bad" : "info"}>
                      {x.syncStatus === "failed"
                        ? "فشل الرفع"
                        : "بانتظار الرفع"}
                    </Badge>
                  </div>
                </li>
              ))}
              {history.data?.slice(0, 15).map((x) => (
                <li
                  key={x.id}
                  className="flex items-center justify-between gap-2 py-2.5 text-sm"
                >
                  <div>
                    <div className="font-bold">
                      {CATEGORY_LABEL[x.category]}
                    </div>
                    <div className="text-xs text-muted">
                      {fmtDate(x.created_at)} · {x.description}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="num font-extrabold">{money(x.amount)}</div>
                    <Badge tone={STATUS_TONE[x.status]}>
                      {EXPENSE_STATUS_LABEL[x.status]}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
            {!queued.length && !history.data?.length && (
              <div className="py-4 text-center text-sm text-muted">
                لا توجد مصروفات بعد.
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
