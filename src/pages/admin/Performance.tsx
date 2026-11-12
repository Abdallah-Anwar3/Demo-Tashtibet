import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import {
  useEngineerPerformance,
  type EngineerPerf,
} from "@/hooks/usePerformance";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Input,
  Select,
  Spinner,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { downloadCSV, money, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function range(key: string): [string, string] {
  const now = new Date();
  if (key === "month")
    return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), todayISO()];
  if (key === "last")
    return [
      iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      iso(new Date(now.getFullYear(), now.getMonth(), 0)),
    ];
  const d = new Date(now);
  d.setDate(d.getDate() - 6);
  return [iso(d), todayISO()];
}
const rate = (a: number, b: number) =>
  b > 0 ? Math.round((a / b) * 100) : null;
const SORTS: Record<
  string,
  { label: string; fn: (r: EngineerPerf) => number }
> = {
  verified: { label: "أيام الحضور الموثّق", fn: (r) => r.verified_days },
  reports: { label: "عدد التقارير", fn: (r) => r.report_days },
  missing: { label: "تقارير ناقصة", fn: (r) => r.missing_reports },
  spent: { label: "المصروف المعتمد", fn: (r) => r.expenses_approved },
};

/** Engineer dashboard: presence, reporting discipline and spending for a chosen period. */
export default function Performance() {
  const [preset, setPreset] = useState("month");
  const [custom, setCustom] = useState<[string, string]>(range("month"));
  const [sort, setSort] = useState("verified");
  const [from, to] = preset === "custom" ? custom : range(preset);
  const q = useEngineerPerformance(from, to);

  const rows = useMemo(
    () =>
      [...(q.data ?? [])].sort((a, b) => SORTS[sort].fn(b) - SORTS[sort].fn(a)),
    [q.data, sort],
  );
  const tot = useMemo(
    () => ({
      verified: rows.reduce((s, r) => s + r.verified_days, 0),
      reports: rows.reduce((s, r) => s + r.report_days, 0),
      missing: rows.reduce((s, r) => s + r.missing_reports, 0),
      spent: rows.reduce((s, r) => s + r.expenses_approved, 0),
    }),
    [rows],
  );

  const csv = () =>
    downloadCSV(`engineers-${from}_${to}.csv`, [
      [
        "المهندس",
        "مشاريع نشطة",
        "أيام حضور",
        "أيام حضور موثّق",
        "أيام بها تقرير",
        "أيام بلا تقرير",
        "نسبة التقارير %",
        "متوسط ساعات اليوم",
        "مصروف معتمد",
        "مصروف قيد المراجعة",
        "مصروف مرفوض",
      ],
      ...rows.map((r) => [
        r.full_name,
        r.active_projects,
        r.field_days,
        r.verified_days,
        r.report_days,
        r.missing_reports,
        rate(r.verified_days - r.missing_reports, r.verified_days) ?? "",
        r.avg_hours,
        r.expenses_approved,
        r.expenses_pending,
        r.expenses_rejected,
      ]),
    ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-black">أداء المهندسين</h1>
        <Button
          variant="secondary"
          size="sm"
          onClick={csv}
          disabled={!rows.length}
        >
          <Download className="h-4 w-4" /> Excel (CSV)
        </Button>
      </div>

      <Card className="grid gap-3 p-4 sm:grid-cols-4">
        <Field label="الفترة">
          <Select value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="month">هذا الشهر</option>
            <option value="last">الشهر الماضي</option>
            <option value="week">آخر 7 أيام</option>
            <option value="custom">فترة محددة</option>
          </Select>
        </Field>
        {preset === "custom" ? (
          <>
            <Field label="من">
              <Input
                type="date"
                value={custom[0]}
                onChange={(e) => setCustom([e.target.value, custom[1]])}
              />
            </Field>
            <Field label="إلى">
              <Input
                type="date"
                value={custom[1]}
                onChange={(e) => setCustom([custom[0], e.target.value])}
              />
            </Field>
          </>
        ) : (
          <div className="self-end pb-2 text-xs text-muted sm:col-span-2">
            من {from} إلى {to}
          </div>
        )}
        <Field label="ترتيب حسب">
          <Select value={sort} onChange={(e) => setSort(e.target.value)}>
            {Object.entries(SORTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      {q.isLoading ? (
        <Spinner />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : !rows.length ? (
        <Card>
          <Empty>لا يوجد مهندسون نشطون.</Empty>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["أيام حضور موثّق", tot.verified],
              ["تقارير مرفوعة", tot.reports],
              ["أيام بلا تقرير", tot.missing],
              ["مصروف معتمد", money(tot.spent)],
            ].map(([l, v]) => (
              <Card key={l as string} className="p-4">
                <div className="text-[11px] text-muted">{l}</div>
                <div
                  className={cn(
                    "num text-lg font-black",
                    l === "أيام بلا تقرير" && (v as number) > 0 && "text-warn",
                  )}
                >
                  {v}
                </div>
              </Card>
            ))}
          </div>

          <Card className="p-2 md:p-4">
            <Table>
              <thead>
                <tr>
                  <Th>المهندس</Th>
                  <Th>مشاريع</Th>
                  <Th>حضور موثّق</Th>
                  <Th>تقارير</Th>
                  <Th>بلا تقرير</Th>
                  <Th>ساعات/يوم</Th>
                  <Th>مصروف معتمد</Th>
                  <Th>قيد المراجعة</Th>
                  <Th>مرفوض</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const ok = rate(
                    r.verified_days - r.missing_reports,
                    r.verified_days,
                  );
                  return (
                    <tr key={r.engineer_id}>
                      <Td>
                        <b>{r.full_name}</b>
                        {ok !== null && (
                          <div className="mt-0.5">
                            <Badge
                              tone={ok >= 90 ? "ok" : ok >= 70 ? "warn" : "bad"}
                            >
                              التزام بالتقارير {ok}%
                            </Badge>
                          </div>
                        )}
                      </Td>
                      <Td className="num">{r.active_projects}</Td>
                      <Td className="num">
                        {r.verified_days}
                        <span className="text-muted"> / {r.field_days}</span>
                      </Td>
                      <Td className="num">{r.report_days}</Td>
                      <Td
                        className={cn(
                          "num",
                          r.missing_reports > 0 && "font-bold text-warn",
                        )}
                      >
                        {r.missing_reports}
                      </Td>
                      <Td className="num">{r.avg_hours || "—"}</Td>
                      <Td className="num">{money(r.expenses_approved)}</Td>
                      <Td className="num text-muted">{r.expenses_pending}</Td>
                      <Td
                        className={cn(
                          "num",
                          r.expenses_rejected > 0 && "text-bad",
                        )}
                      >
                        {r.expenses_rejected}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <p className="mt-3 text-[11px] text-muted">
              «حضور موثّق» = يوم سجّل فيه المهندس حضوره داخل نطاق الموقع (الرقم
              بعد الشرطة هو كل أيام الحضور). «بلا تقرير» = يوم حضور موثّق لم
              يُرفع له تقرير يومي. التزام التقارير = نسبة أيام الحضور الموثّق
              التي رُفع لها تقرير.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
