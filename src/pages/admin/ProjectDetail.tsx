import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  useAttendance,
  useExpenses,
  useProjects,
  useReports,
  useSaveProject,
  useSpendByProject,
  useStageHistory,
  useTeam,
} from "@/hooks/useData";
import {
  Badge,
  Button,
  Card,
  Empty,
  Input,
  Spinner,
  Table,
  Td,
  Th,
  useToast,
} from "@/components/ui";
import { Photos } from "@/components/Photos";
import { ReportCard } from "@/components/ReportCard";
import { ClientUpdatePanel } from "@/components/ClientUpdatePanel";
import { GroupLinkCard } from "@/components/GroupLinkCard";
import { PaymentsPanel, RequestsPanel } from "@/components/ManagerClientPanels";
import { durationHM, fmtDate, fmtDateTime, fmtTime, money } from "@/lib/format";
import {
  CATEGORY_LABEL,
  EXPENSE_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  STAGES,
  STAGE_LABEL,
} from "@/lib/labels";
import { cn } from "@/lib/utils";
import { FEATURES } from "@/lib/features";
import { SchedulePanel } from "@/components/SchedulePanel";
import { InventoryPanel } from "@/components/InventoryPanel";
import { DocumentsPanel } from "@/components/DocumentsPanel";
import { BoqPanel } from "@/components/BoqPanel";
import { ChangeOrdersPanel } from "@/components/ChangeOrdersPanel";
import { SubcontractsPanel } from "@/components/SubcontractsPanel";

const TABS = [
  ["photos", "معرض الصور"],
  ["reports", "التقارير"],
  ["expenses", "المصروفات"],
  ["attendance", "الحضور"],
  ["client", "تقرير العميل"],
  ["payments", "الدفعات"],
  ["requests", "طلبات وتقييم العميل"],
  ["schedule", "الجدول الزمني"],
  ["inventory", "المخزون"],
  ["documents", "المستندات"],
  ["boq", "المقايسة"],
  ["changes", "أوامر التغيير"],
  ["subcontracts", "مقاولو الباطن"],
] as const;
type Tab = (typeof TABS)[number][0];
const OFF: string[] = [
  ...(FEATURES.clientPortal ? [] : ["client", "payments", "requests"]),
  ...(FEATURES.schedule ? [] : ["schedule"]),
  ...(FEATURES.inventory ? [] : ["inventory"]),
  ...(FEATURES.documents ? [] : ["documents"]),
  ...(FEATURES.boq ? [] : ["boq"]),
  ...(FEATURES.changeOrders && FEATURES.clientPortal ? [] : ["changes"]),
  ...(FEATURES.subcontracts ? [] : ["subcontracts"]),
];
const VISIBLE_TABS = TABS.filter(([k]) => !OFF.includes(k));

export default function ProjectDetail() {
  const { id } = useParams();
  const { isManager } = useAuth();
  const toast = useToast();
  const projects = useProjects();
  const team = useTeam();
  const spend = useSpendByProject();
  const history = useStageHistory(id);
  const save = useSaveProject();
  const [params] = useSearchParams();
  const wanted = params.get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(
    VISIBLE_TABS.some(([k]) => k === wanted) ? (wanted as Tab) : "photos",
  );
  const [pct, setPct] = useState<string | null>(null);

  const reports = useReports({ projectId: id, limit: 50 });
  const expenses = useExpenses({ projectId: id });
  const attendance = useAttendance({ projectId: id });

  const p = projects.data?.find((x) => x.id === id);
  if (projects.isLoading) return <Spinner />;
  if (!p)
    return (
      <Card>
        <Empty>المشروع غير موجود أو لا تملك صلاحية الوصول إليه.</Empty>
      </Card>
    );

  const name = (uid: string | null) =>
    team.data?.find((t) => t.id === uid)?.full_name ?? "—";
  const spent = spend.data?.[p.id] ?? 0;
  const used = p.budget > 0 ? Math.round((spent / p.budget) * 100) : 0;
  const stageIdx = STAGES.indexOf(p.stage);
  const shown = pct ?? String(p.progress_pct);

  const savePct = () => {
    const n = Math.round(Number(shown));
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      toast("النسبة بين 0 و 100", "bad");
      return;
    }
    save.mutate(
      { id: p.id, title: p.title, client_name: p.client_name, progress_pct: n },
      {
        onSuccess: () => {
          toast("تم تحديث نسبة الإنجاز");
          setPct(null);
        },
        onError: (e) => toast((e as Error).message, "bad"),
      },
    );
  };

  const budgetTone = used >= 100 ? "bg-bad" : used >= 80 ? "bg-warn" : "bg-ok";
  const photoReports = (reports.data ?? []).filter(
    (r) => r.photos_urls?.length,
  );

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/admin/projects"
        className="inline-flex items-center gap-1 text-xs font-bold text-muted hover:text-brand"
      >
        <ArrowRight className="h-3.5 w-3.5" /> كل المشاريع
      </Link>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-black">{p.title}</h1>
            <div className="text-sm text-muted">
              {p.client_name}
              {p.address ? ` · ${p.address}` : ""}
            </div>
            <div className="mt-1 text-xs text-muted">
              المهندسون: {p.assigned_engineer_ids.map(name).join("، ") || "—"}
            </div>
          </div>
          <div className="flex gap-2">
            <Badge
              tone={
                p.status === "active"
                  ? "ok"
                  : p.status === "completed"
                    ? "info"
                    : "gray"
              }
            >
              {PROJECT_STATUS_LABEL[p.status]}
            </Badge>
            {used >= 100 ? (
              <Badge tone="bad">تجاوز الميزانية</Badge>
            ) : used >= 80 ? (
              <Badge tone="warn">اقتراب من الميزانية</Badge>
            ) : null}
          </div>
        </div>

        <ol className="mt-5 flex flex-wrap gap-2" aria-label="مراحل المشروع">
          {STAGES.map((s, i) => (
            <li
              key={s}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold",
                i < stageIdx
                  ? "bg-ok-soft text-ok"
                  : i === stageIdx
                    ? "bg-brand text-white"
                    : "bg-raised text-muted",
              )}
            >
              {i < stageIdx && <Check className="h-3 w-3" />}
              {STAGE_LABEL[s]}
            </li>
          ))}
        </ol>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs font-bold">
              <span>نسبة الإنجاز</span>
              <span className="num">{p.progress_pct}%</span>
            </div>
            <div
              className="h-2.5 overflow-hidden rounded-full bg-line"
              role="progressbar"
              aria-valuenow={p.progress_pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-ok"
                style={{ width: `${p.progress_pct}%` }}
              />
            </div>
            {isManager && (
              <div className="mt-3 flex items-center gap-2">
                <Input
                  dir="ltr"
                  type="number"
                  min={0}
                  max={100}
                  className="w-24"
                  value={shown}
                  onChange={(e) => setPct(e.target.value)}
                  aria-label="نسبة الإنجاز"
                />
                <Button
                  size="sm"
                  loading={save.isPending}
                  disabled={pct === null}
                  onClick={savePct}
                >
                  حفظ النسبة
                </Button>
                <span className="text-[11px] text-muted">
                  يحدّثها المدير ومدير المشاريع فقط.
                </span>
              </div>
            )}
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs font-bold">
              <span>الميزانية</span>
              <span className="num">{used}% مستخدم</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-line">
              <div
                className={cn("h-full rounded-full", budgetTone)}
                style={{ width: `${Math.min(used, 100)}%` }}
              />
            </div>
            <div className="num mt-1.5 text-xs text-muted">
              المصروف {money(spent)} من {money(p.budget)} · المتبقي{" "}
              {money(p.budget - spent)}
            </div>
            <div className="num mt-1 text-xs text-muted">
              التسليم: {p.delivery_date ? fmtDate(p.delivery_date) : "—"}
            </div>
          </div>
        </div>

        {!!history.data?.length && (
          <div className="mt-5 border-t border-line pt-4">
            <div className="mb-2 text-xs font-extrabold text-muted">
              سجل المراحل
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
              {history.data.map((h) => (
                <li key={h.id}>
                  <b>{STAGE_LABEL[h.stage]}</b>{" "}
                  <span className="text-muted">
                    · {fmtDateTime(h.changed_at)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <div
        className="flex gap-1 overflow-x-auto rounded-xl bg-raised p-1"
        role="tablist"
      >
        {VISIBLE_TABS.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold",
              tab === k ? "bg-card text-brand shadow-sm" : "text-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "photos" &&
        (reports.isLoading ? (
          <Spinner />
        ) : !photoReports.length ? (
          <Card>
            <Empty>لا توجد صور بعد.</Empty>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {photoReports.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="mb-2 text-xs text-muted">
                  {fmtDate(r.date)} · {name(r.engineer_id)}
                </div>
                <Photos
                  paths={r.photos_urls ?? []}
                  label={`${p.title}-${r.date}`}
                />
              </Card>
            ))}
          </div>
        ))}

      {tab === "reports" &&
        (reports.isLoading ? (
          <Spinner />
        ) : !reports.data?.length ? (
          <Card>
            <Empty>لا توجد تقارير.</Empty>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {reports.data.map((r) => (
              <ReportCard
                key={r.id}
                r={r}
                project={p.title}
                engineer={name(r.engineer_id)}
              />
            ))}
          </div>
        ))}

      {tab === "expenses" && (
        <Card>
          {expenses.isLoading ? (
            <Spinner />
          ) : !expenses.data?.length ? (
            <Empty>لا توجد مصروفات.</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>التاريخ</Th>
                  <Th>المهندس</Th>
                  <Th>الفئة</Th>
                  <Th>التفاصيل</Th>
                  <Th>المبلغ</Th>
                  <Th>الحالة</Th>
                </tr>
              </thead>
              <tbody>
                {expenses.data.map((x) => (
                  <tr key={x.id} className="hover:bg-raised">
                    <Td className="whitespace-nowrap text-xs">
                      {fmtDate(x.created_at)}
                    </Td>
                    <Td className="font-bold">{name(x.engineer_id)}</Td>
                    <Td>{CATEGORY_LABEL[x.category]}</Td>
                    <Td className="max-w-[240px] truncate text-xs">
                      {x.description}
                    </Td>
                    <Td className="num font-extrabold">{money(x.amount)}</Td>
                    <Td>
                      <Badge
                        tone={
                          x.status === "approved"
                            ? "ok"
                            : x.status === "rejected"
                              ? "bad"
                              : "warn"
                        }
                      >
                        {EXPENSE_STATUS_LABEL[x.status]}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === "payments" && <PaymentsPanel projectId={p.id} />}
      {tab === "requests" && <RequestsPanel projectId={p.id} />}
      {tab === "schedule" && <SchedulePanel projectId={p.id} />}
      {tab === "inventory" && <InventoryPanel projectId={p.id} />}
      {tab === "documents" && <DocumentsPanel projectId={p.id} />}
      {tab === "boq" && (
        <BoqPanel projectId={p.id} clientName={p.client_name} />
      )}
      {tab === "changes" && <ChangeOrdersPanel projectId={p.id} />}
      {tab === "subcontracts" && <SubcontractsPanel projectId={p.id} />}
      {tab === "client" && (
        <>
          <GroupLinkCard projectId={p.id} />
          <ClientUpdatePanel projectId={p.id} projectTitle={p.title} />
        </>
      )}

      {tab === "attendance" && (
        <Card>
          {attendance.isLoading ? (
            <Spinner />
          ) : !attendance.data?.length ? (
            <Empty>لا يوجد حضور مسجّل.</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>التاريخ</Th>
                  <Th>المهندس</Th>
                  <Th>حضور</Th>
                  <Th>انصراف</Th>
                  <Th>المدة</Th>
                  <Th>النطاق</Th>
                </tr>
              </thead>
              <tbody>
                {attendance.data.map((a) => (
                  <tr key={a.id} className="hover:bg-raised">
                    <Td className="text-xs">{fmtDate(a.date)}</Td>
                    <Td className="font-bold">{name(a.engineer_id)}</Td>
                    <Td className="num text-xs">{fmtTime(a.check_in_time)}</Td>
                    <Td className="num text-xs">
                      {a.check_out_time ? fmtTime(a.check_out_time) : "—"}
                    </Td>
                    <Td className="num text-xs">
                      {durationHM(a.check_in_time, a.check_out_time)}
                    </Td>
                    <Td>
                      <Badge tone={a.is_within_geofence ? "ok" : "warn"}>
                        {a.is_within_geofence ? "داخل النطاق" : "خارج النطاق"}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}
