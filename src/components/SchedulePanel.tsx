import { useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import {
  useDeleteMilestone,
  useMilestones,
  useSaveMilestone,
  type Milestone,
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
  useToast,
} from "@/components/ui";
import { fmtDate, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

const DAY = 86400000;
const ms = (d: string) => new Date(d + "T00:00:00").getTime();
const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY);
const plural = (n: number) =>
  n === 1
    ? "يوم"
    : n === 2
      ? "يومين"
      : n >= 3 && n <= 10
        ? `${n} أيام`
        : `${n} يوماً`;

type State = "done" | "late" | "active" | "next";
function stateOf(m: Milestone, today: string): State {
  if (m.done_at) return "done";
  if (m.end_date < today) return "late";
  if (m.start_date <= today) return "active";
  return "next";
}

/** Plain-language timeline: a summary, then one card per stage saying what is done, what is running and what is next. */
export function Timeline({ items }: { items: Milestone[] }) {
  if (!items.length) return null;
  const today = todayISO();
  const sorted = [...items].sort((a, b) =>
    a.start_date.localeCompare(b.start_date),
  );
  const done = sorted.filter((m) => m.done_at).length;
  const pct = Math.round((done / sorted.length) * 100);
  const late = sorted.filter((m) => stateOf(m, today) === "late").length;
  const last = sorted.reduce(
    (mx, m) => (m.end_date > mx ? m.end_date : mx),
    sorted[0].end_date,
  );

  return (
    <div>
      <div className="mb-4 rounded-xl bg-raised p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <b>
            انتهت {done} من {sorted.length} مراحل
          </b>
          <span className="text-xs text-muted">
            آخر مرحلة تنتهي {fmtDate(last)}
          </span>
        </div>
        <div
          className="mt-2 h-2.5 overflow-hidden rounded-full bg-line"
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
        {late > 0 && (
          <div className="mt-2 text-xs font-bold text-bad">
            {late === 1 ? "مرحلة واحدة متأخرة" : `${late} مراحل متأخرة`} عن
            موعدها
          </div>
        )}
      </div>

      <ol className="relative flex flex-col gap-3 border-s-2 border-line ps-5">
        {sorted.map((m) => {
          const st = stateOf(m, today);
          const total = daysBetween(m.start_date, m.end_date) + 1;
          const elapsed = Math.min(
            total,
            Math.max(0, daysBetween(m.start_date, today) + 1),
          );
          const text =
            st === "done"
              ? `انتهت ${fmtDate(m.done_at!)}`
              : st === "late"
                ? `متأخرة ${plural(daysBetween(m.end_date, today))} عن الموعد`
                : st === "active"
                  ? m.end_date === today
                    ? "تنتهي اليوم"
                    : `جارية الآن — باقي ${plural(daysBetween(today, m.end_date))}`
                  : `تبدأ بعد ${plural(daysBetween(today, m.start_date))}`;
          const tone = {
            done: "text-ok",
            late: "text-bad",
            active: "text-brand",
            next: "text-muted",
          }[st];
          const dot = {
            done: "bg-ok",
            late: "bg-bad",
            active: "bg-brand",
            next: "bg-line",
          }[st];
          return (
            <li key={m.id} className="relative">
              <span
                className={cn(
                  "absolute -start-[1.72rem] top-3 grid h-4 w-4 place-items-center rounded-full ring-4 ring-card",
                  dot,
                )}
                aria-hidden="true"
              >
                {st === "done" && (
                  <Check className="h-2.5 w-2.5 text-white" strokeWidth={4} />
                )}
              </span>
              <div
                className={cn(
                  "rounded-xl border p-3",
                  st === "active"
                    ? "border-brand bg-brand-soft"
                    : st === "late"
                      ? "border-bad/50 bg-bad-soft"
                      : "border-line bg-card",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <b className="text-sm">{m.title}</b>
                  <span className={cn("text-xs font-bold", tone)}>{text}</span>
                </div>
                <div className="mt-1 text-xs text-muted">
                  من {fmtDate(m.start_date)} إلى {fmtDate(m.end_date)} · المدة{" "}
                  {plural(total)}
                </div>
                {st === "active" && (
                  <div className="mt-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-line">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{
                          width: `${Math.round((elapsed / total) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted">
                      مرّ {Math.round((elapsed / total) * 100)}% من مدة المرحلة
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
export const Gantt = Timeline;

const blank = {
  title: "",
  start_date: todayISO(),
  end_date: todayISO(),
  visible_to_client: true,
};

/** Manager tab: add / edit / finish / delete milestones. */
export function SchedulePanel({ projectId }: { projectId: string }) {
  const toast = useToast();
  const q = useMilestones(projectId);
  const save = useSaveMilestone();
  const del = useDeleteMilestone();
  const [edit, setEdit] = useState<(Partial<Milestone> & typeof blank) | null>(
    null,
  );
  const [err, setErr] = useState<unknown>(null);
  const items = q.data ?? [];
  const today = todayISO();

  const submit = () => {
    if (!edit) return;
    if (!edit.title.trim()) {
      setErr(new Error("اكتب اسم المرحلة"));
      return;
    }
    if (edit.end_date < edit.start_date) {
      setErr(new Error("تاريخ النهاية قبل البداية"));
      return;
    }
    save.mutate(
      { ...edit, project_id: projectId, title: edit.title.trim() },
      {
        onSuccess: () => {
          setEdit(null);
          setErr(null);
        },
        onError: (e) => setErr(e),
      },
    );
  };
  const finish = (m: Milestone) =>
    save.mutate(
      {
        id: m.id,
        project_id: projectId,
        title: m.title,
        start_date: m.start_date,
        end_date: m.end_date,
        done_at: m.done_at ? null : today,
      },
      { onError: (e) => toast((e as Error).message, "bad") },
    );

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-extrabold">الجدول الزمني</h3>
          <Button
            size="sm"
            onClick={() => {
              setEdit({ ...blank });
              setErr(null);
            }}
          >
            <Plus className="h-4 w-4" /> مرحلة
          </Button>
        </div>
        {q.isLoading ? (
          <Spinner />
        ) : !items.length ? (
          <Empty>لم تُضف مراحل بعد. اضغط «مرحلة» لإضافة أول مرحلة.</Empty>
        ) : (
          <Timeline items={items} />
        )}
      </Card>

      {!!items.length && (
        <Card className="divide-y divide-line">
          {items.map((m) => {
            const late = !m.done_at && m.end_date < today;
            return (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <div>
                  <b>{m.title}</b>{" "}
                  {m.done_at ? (
                    <Badge tone="ok">اكتملت {fmtDate(m.done_at)}</Badge>
                  ) : late ? (
                    <Badge tone="bad">متأخرة</Badge>
                  ) : (
                    <Badge tone="gray">جارية / قادمة</Badge>
                  )}
                  {!m.visible_to_client && (
                    <span className="ms-2 text-[11px] text-muted">
                      مخفية عن العميل
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ok" onClick={() => finish(m)}>
                    <Check className="h-4 w-4" />{" "}
                    {m.done_at ? "إلغاء الإنجاز" : "تم"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="تعديل"
                    onClick={() => {
                      setEdit({ ...m });
                      setErr(null);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    aria-label="حذف"
                    onClick={() => {
                      if (confirm("حذف هذه المرحلة؟"))
                        del.mutate(m.id, {
                          onError: (e) => toast((e as Error).message, "bad"),
                        });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "تعديل مرحلة" : "مرحلة جديدة"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>
              إلغاء
            </Button>
            <Button loading={save.isPending} onClick={submit}>
              حفظ
            </Button>
          </>
        }
      >
        {edit && (
          <div className="flex flex-col gap-3">
            <Field label="اسم المرحلة">
              <Input
                value={edit.title}
                maxLength={120}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                placeholder="مثال: تركيب السيراميك"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="من">
                <Input
                  type="date"
                  value={edit.start_date}
                  onChange={(e) =>
                    setEdit({ ...edit, start_date: e.target.value })
                  }
                />
              </Field>
              <Field label="إلى">
                <Input
                  type="date"
                  value={edit.end_date}
                  onChange={(e) =>
                    setEdit({ ...edit, end_date: e.target.value })
                  }
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                checked={edit.visible_to_client}
                onChange={(e) =>
                  setEdit({ ...edit, visible_to_client: e.target.checked })
                }
              />{" "}
              تظهر للعميل
            </label>
            <ErrorNote error={err} />
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Read-only card for the client portal. Renders nothing when there is no visible schedule. */
export function ClientScheduleCard({ projectId }: { projectId: string }) {
  const q = useMilestones(projectId);
  if (!q.data?.length) return null;
  return (
    <Card className="p-5">
      <h2 className="mb-3 font-extrabold">الجدول الزمني للمشروع</h2>
      <Timeline items={q.data} />
    </Card>
  );
}
