import { useState } from "react";
import { Database, Download, Printer } from "lucide-react";
import { useFinance } from "@/hooks/useExtras";
import { downloadBackupZip } from "@/lib/backupZip";
import { useAuth } from "@/hooks/useAuth";
import {
  Button,
  Card,
  Empty,
  ErrorNote,
  Spinner,
  Table,
  Td,
  Th,
  useToast,
} from "@/components/ui";
import { downloadCSV, money, todayISO } from "@/lib/format";
import { PROJECT_STATUS_LABEL } from "@/lib/labels";
import type { ProjectStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Per-project money picture: what we spend vs the budget, what the client paid, what we owe suppliers. */
export default function Finance() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const q = useFinance();
  const [busy, setBusy] = useState<string | null>(null);
  const rows = q.data ?? [];
  const sum = (
    k:
      | "budget"
      | "spent"
      | "pending"
      | "client_total"
      | "client_paid"
      | "supplier_due",
  ) => rows.reduce((s, r) => s + r[k], 0);
  // Cash view: client money received minus approved spending and what is still owed to suppliers.
  const net = (r: {
    client_paid: number;
    spent: number;
    supplier_due: number;
  }) => r.client_paid - r.spent - r.supplier_due;

  const csv = () =>
    downloadCSV(`finance-${todayISO()}.csv`, [
      [
        "المشروع",
        "العميل",
        "الحالة",
        "الميزانية",
        "المصروف المعتمد",
        "قيد المراجعة",
        "إجمالي الدفعات",
        "المحصّل",
        "مستحق للموردين",
        "الصافي",
      ],
      ...rows.map((r) => [
        r.title,
        r.client_name,
        PROJECT_STATUS_LABEL[r.status as ProjectStatus] ?? r.status,
        r.budget,
        r.spent,
        r.pending,
        r.client_total,
        r.client_paid,
        r.supplier_due,
        net(r),
      ]),
    ]);

  const backup = async () => {
    setBusy("...");
    try {
      await downloadBackupZip((t) => setBusy(t));
      toast("تم تنزيل النسخة الاحتياطية");
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(null);
    }
  };

  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorNote error={q.error} />;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h1 className="text-xl font-black">التقارير المالية</h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={csv}>
            <Download className="h-4 w-4" /> Excel (CSV)
          </Button>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> PDF (طباعة)
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["المحصّل من العملاء", sum("client_paid")],
          ["المصروف المعتمد", sum("spent")],
          ["مستحق للموردين", sum("supplier_due")],
          [
            "الصافي النقدي",
            sum("client_paid") - sum("spent") - sum("supplier_due"),
          ],
        ].map(([l, v]) => (
          <Card key={l as string} className="p-4">
            <div className="text-[11px] text-muted">{l}</div>
            <div
              className={cn(
                "num text-lg font-black",
                (v as number) < 0 && l === "الصافي النقدي" && "text-bad",
              )}
            >
              {money(v as number)}
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-2 md:p-4">
        {!rows.length ? (
          <Empty>لا توجد مشاريع.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>المشروع</Th>
                <Th>الميزانية</Th>
                <Th>المصروف</Th>
                <Th>قيد المراجعة</Th>
                <Th>المحصّل / الإجمالي</Th>
                <Th>للموردين</Th>
                <Th>الصافي</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const over = r.budget > 0 && r.spent > r.budget;
                return (
                  <tr key={r.project_id}>
                    <Td>
                      <b>{r.title}</b>
                      <div className="text-[11px] text-muted">
                        {r.client_name}
                      </div>
                    </Td>
                    <Td className="num">{money(r.budget)}</Td>
                    <Td className={cn("num", over && "font-bold text-bad")}>
                      {money(r.spent)}
                    </Td>
                    <Td className="num text-muted">{money(r.pending)}</Td>
                    <Td className="num">
                      {money(r.client_paid)}{" "}
                      <span className="text-muted">
                        / {money(r.client_total)}
                      </span>
                    </Td>
                    <Td className="num">{money(r.supplier_due)}</Td>
                    <Td
                      className={cn("num font-bold", net(r) < 0 && "text-bad")}
                    >
                      {money(net(r))}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <p className="mt-3 text-[11px] text-muted">
          الصافي = المحصّل من العميل − المصروف المعتمد − المستحق للموردين.
          المصروفات قيد المراجعة غير محسوبة.
        </p>
      </Card>

      {isAdmin && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4 print:hidden">
          <div>
            <div className="flex items-center gap-2 font-extrabold">
              <Database className="h-4 w-4" /> نسخة احتياطية
            </div>
            <p className="text-xs text-muted">
              ينزّل كل بيانات النظام (بدون الصور) في ملف مضغوط واحد، بداخله جدول
              Excel لكل قسم (مشاريع، مصروفات، مرتبات...) تُفتح مباشرة. احتفظ به
              خارج الموقع، ويفضّل أسبوعياً.
            </p>
          </div>
          <Button loading={!!busy} onClick={() => void backup()}>
            {busy && busy !== "..." ? `جاري: ${busy}` : "تنزيل النسخة"}
          </Button>
        </Card>
      )}
    </div>
  );
}
