import { ClientChangeOrdersCard } from "@/components/ClientChangeOrdersCard";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, FileDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useClientDashboard, useClientUpdates } from "@/hooks/useData";
import {
  Badge,
  Card,
  Empty,
  ErrorNote,
  Select,
  Spinner,
} from "@/components/ui";
import { Photos } from "@/components/Photos";
import { StageRatingCard } from "@/components/StageRatingCard";
import { StageApprovalCard } from "@/components/StageApprovalCard";
import { fmtDate, money } from "@/lib/format";
import {
  CATEGORY_LABEL,
  PROJECT_STATUS_LABEL,
  STAGES,
  STAGE_LABEL,
} from "@/lib/labels";
import { cn } from "@/lib/utils";
import { FEATURES } from "@/lib/features";
import { ClientScheduleCard } from "@/components/SchedulePanel";
import { ClientDocumentsCard } from "@/components/DocumentsPanel";
import { ClientContactCard } from "@/components/ClientContactCard";

/** Client home: everything here comes from the curated client_dashboard() function. */
export default function ClientHome() {
  const { profile } = useAuth();
  const dash = useClientDashboard();
  const [sel, setSel] = useState("");
  const projects = dash.data ?? [];
  const p = projects.find((x) => x.id === sel) ?? projects[0];
  const latest = useClientUpdates({ projectId: p?.id, limit: 1 });

  if (dash.isLoading) return <Spinner />;
  if (dash.error) return <ErrorNote error={dash.error} />;
  if (!p)
    return (
      <Card>
        <Empty>لا توجد مشاريع مرتبطة بحسابك بعد. تواصل مع الشركة.</Empty>
      </Card>
    );

  const stageIdx = STAGES.indexOf(p.stage);
  const used = p.budget > 0 ? Math.round((p.spent / p.budget) * 100) : 0;
  const up = latest.data?.[0];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="text-sm text-muted">أهلاً {profile?.full_name}</div>

      {projects.length > 1 && (
        <Select
          value={p.id}
          onChange={(e) => setSel(e.target.value)}
          aria-label="اختيار المشروع"
        >
          {projects.map((x) => (
            <option key={x.id} value={x.id}>
              {x.title}
            </option>
          ))}
        </Select>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-black">{p.title}</h1>
            {p.address && <div className="text-sm text-muted">{p.address}</div>}
          </div>
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
        </div>

        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between text-xs font-bold">
            <span>نسبة الإنجاز</span>
            <span className="num">{p.progress_pct}%</span>
          </div>
          <div
            className="h-3 overflow-hidden rounded-full bg-line"
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

        <div className="num mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
          <span>البداية: {p.start_date ? fmtDate(p.start_date) : "—"}</span>
          <span>
            التسليم المتوقع: {p.delivery_date ? fmtDate(p.delivery_date) : "—"}
          </span>
        </div>
      </Card>

      {p.next_due && (
        <Card className="flex items-center justify-between gap-3 p-4">
          <div>
            <div className="text-[11px] text-muted">الدفعة القادمة</div>
            <div className="font-bold">{p.next_due.title}</div>
            <div className="num text-xs text-muted">
              الاستحقاق {fmtDate(p.next_due.due_date)}
            </div>
          </div>
          <div className="num text-lg font-black">
            {money(p.next_due.amount)}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="mb-3 font-extrabold">المصروفات</h2>
        <div className="mb-1.5 flex items-center justify-between text-xs font-bold">
          <span>المصروف المعتمد من الميزانية</span>
          <span className="num">{used}%</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-line">
          <div
            className={cn(
              "h-full rounded-full",
              used >= 100 ? "bg-bad" : used >= 80 ? "bg-warn" : "bg-brand",
            )}
            style={{ width: `${Math.min(used, 100)}%` }}
          />
        </div>
        <div className="num mt-1.5 text-sm">
          <b>{money(p.spent)}</b>{" "}
          <span className="text-muted">من {money(p.budget)}</span>
        </div>
        {!!p.by_category.length && (
          <ul className="mt-4 divide-y divide-line text-sm">
            {p.by_category.map((c) => (
              <li key={c.category} className="flex justify-between py-2">
                <span>{CATEGORY_LABEL[c.category] ?? c.category}</span>
                <span className="num font-bold">{money(c.total)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-muted">
          تشمل المصروفات المعتمدة فقط.
        </p>
      </Card>

      {FEATURES.schedule && <ClientScheduleCard projectId={p.id} />}

      {FEATURES.changeOrders && <ClientChangeOrdersCard projectId={p.id} />}

      <StageApprovalCard project={p} />

      <StageRatingCard project={p} />

      {FEATURES.documents && <ClientDocumentsCard projectId={p.id} />}

      {FEATURES.contact && (
        <ClientContactCard projectId={p.id} projectTitle={p.title} />
      )}

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-extrabold">آخر تقرير</h2>
          <span className="flex items-center gap-4">
            <Link
              to={`/client/report?project=${p.id}`}
              className="flex items-center gap-1 text-xs font-bold text-brand"
            >
              <FileDown className="h-3.5 w-3.5" /> تقرير PDF
            </Link>
            <Link to="/client/updates" className="text-xs font-bold text-brand">
              كل التقارير
            </Link>
          </span>
        </div>
        {latest.isLoading ? (
          <Spinner />
        ) : !up ? (
          <Empty>لم يُنشر أي تقرير بعد.</Empty>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="text-xs text-muted">{fmtDate(up.date)}</div>
            <p className="whitespace-pre-wrap text-sm">{up.summary}</p>
            <Photos paths={up.photos} label={`${p.title}-${up.date}`} />
          </div>
        )}
      </Card>
    </div>
  );
}
