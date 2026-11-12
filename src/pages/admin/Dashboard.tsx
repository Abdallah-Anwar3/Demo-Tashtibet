import { Link } from "react-router-dom";
import {
  Building2,
  CalendarCheck,
  ClipboardList,
  HardHat,
  Receipt,
  Wallet,
} from "lucide-react";
import {
  useAttendance,
  useExpenses,
  useLiveFeed,
  useMonthExpenseTotal,
  useProjects,
  useSpendByProject,
  useTeam,
  useWallets,
} from "@/hooks/useData";
import { Badge, Card, Empty, Spinner } from "@/components/ui";
import { fmtTime, money, num, todayISO } from "@/lib/format";
import { STAGE_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  sub?: string;
  tone: string;
}) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className={cn("absolute inset-y-0 end-0 w-1", tone)} />
      <Icon className="mb-3 h-6 w-6 text-muted" />
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className="num mt-1 text-2xl font-black">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-muted">{sub}</div>}
    </Card>
  );
}

const FEED_LABEL = {
  attendance: "تسجيل حضور",
  report: "تقرير يومي جديد",
  expense: "مصروف جديد",
} as const;
const FEED_ICON = {
  attendance: CalendarCheck,
  report: ClipboardList,
  expense: Receipt,
} as const;

export default function Dashboard() {
  const projects = useProjects();
  const team = useTeam();
  const wallets = useWallets();
  const today = useAttendance({ date: todayISO() });
  const month = useMonthExpenseTotal();
  const spend = useSpendByProject();
  const pending = useExpenses({ status: "pending_review" });
  const feed = useLiveFeed();

  const name = (id: string) =>
    team.data?.find((p) => p.id === id)?.full_name ?? "—";
  const title = (id: string | null) =>
    projects.data?.find((p) => p.id === id)?.title ?? "";

  const active = projects.data?.filter((p) => p.status === "active") ?? [];
  const inField = new Set(
    today.data?.filter((a) => !a.check_out_time).map((a) => a.engineer_id),
  ).size;
  const engineers =
    team.data?.filter((p) => p.role === "site_engineer" && p.is_active)
      .length ?? 0;
  const floating =
    wallets.data
      ?.filter(
        (w) =>
          team.data?.find((u) => u.id === w.engineer_id)?.role ===
          "site_engineer",
      )
      .reduce((s, w) => s + Number(w.current_balance), 0) ?? 0;
  const monthTotal = month.data?.reduce((s, r) => s + Number(r.amount), 0) ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        <Kpi
          icon={Building2}
          label="المواقع النشطة"
          value={num(active.length)}
          tone="bg-ok"
        />
        <Kpi
          icon={HardHat}
          label="مهندسون في الميدان الآن"
          value={num(inField)}
          sub={`من أصل ${num(engineers)} مهندس`}
          tone="bg-info"
        />
        <Kpi
          icon={Wallet}
          label="إجمالي العهد المتداولة"
          value={money(floating)}
          tone="bg-brand"
        />
        <Kpi
          icon={Receipt}
          label="مصروفات الشهر الحالي"
          value={money(monthTotal)}
          sub="بدون المرفوض"
          tone="bg-bad"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <section>
          <h2 className="mb-3 font-extrabold">تقدم المشاريع النشطة</h2>
          <Card>
            {projects.isLoading ? (
              <Spinner />
            ) : !active.length ? (
              <Empty>لا توجد مشاريع نشطة.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {active.map((p) => {
                  const pct = p.progress_pct ?? 0;
                  const spent = spend.data?.[p.id] ?? 0;
                  const over = p.budget > 0 && spent > p.budget;
                  const late = p.delivery_date && p.delivery_date < todayISO();
                  return (
                    <li key={p.id} className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Link
                            to={`/admin/projects/${p.id}`}
                            className="font-bold hover:text-brand hover:underline"
                          >
                            {p.title}
                          </Link>
                          <div className="text-xs text-muted">
                            {p.client_name} · {STAGE_LABEL[p.stage]}
                          </div>
                        </div>
                        {late ? (
                          <Badge tone="bad">تجاوز موعد التسليم</Badge>
                        ) : over ? (
                          <Badge tone="warn">تجاوز الميزانية</Badge>
                        ) : (
                          <Badge tone="ok">نشط</Badge>
                        )}
                      </div>
                      <div className="mt-2.5 flex items-center gap-3">
                        <div
                          className="h-2 flex-1 overflow-hidden rounded-full bg-line"
                          role="progressbar"
                          aria-valuenow={pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`إنجاز ${p.title}`}
                        >
                          <div
                            className={cn(
                              "h-full rounded-full",
                              late ? "bg-bad" : "bg-ok",
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="num w-9 text-xs font-extrabold">
                          {pct}%
                        </span>
                      </div>
                      <div className="num mt-1.5 flex justify-between text-[11px] text-muted">
                        <span>
                          المصروف {money(spent)} من {money(p.budget)}
                        </span>
                        <span>{p.delivery_date ?? ""}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-extrabold">التحديثات الآنية</h2>
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-ok">
              <span className="h-2 w-2 animate-pulse rounded-full bg-ok" />
              مباشر
            </span>
          </div>
          <Card>
            {!feed.length ? (
              <Empty>سيظهر هنا كل تسجيل حضور وتقرير ومصروف لحظة حدوثه.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {feed.map((it) => {
                  const Icon = FEED_ICON[it.kind];
                  return (
                    <li key={it.id} className="flex items-start gap-3 p-3.5">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-dark">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold">
                          {name(it.engineerId)} · {FEED_LABEL[it.kind]}
                        </div>
                        <div className="truncate text-xs text-muted">
                          {title(it.projectId)} {it.detail && `· ${it.detail}`}
                        </div>
                      </div>
                      <div className="num text-[11px] text-muted">
                        {fmtTime(it.at)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>
      </div>

      {!!pending.data?.length && (
        <Link
          to="/admin/expenses"
          className="flex items-center justify-between rounded-xl border border-warn/30 bg-warn-soft p-4 text-sm font-bold text-warn"
        >
          <span>{num(pending.data.length)} مصروفات بانتظار الاعتماد</span>
          <span>مراجعة ←</span>
        </Link>
      )}
    </div>
  );
}
