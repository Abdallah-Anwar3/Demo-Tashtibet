import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  useDeletePayment,
  usePayments,
  useRatings,
  useRequests,
  useSavePayment,
  useSetRequestStatus,
  useTeam,
} from "@/hooks/useData";
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
import { useApprovals } from "@/hooks/useApprovals";
import { RequestThread } from "@/components/RequestThread";
import { Stars } from "@/components/Stars";
import { fmtDate, money, todayISO } from "@/lib/format";
import {
  REQUEST_KIND_LABEL,
  REQUEST_STATUS_LABEL,
  STAGE_LABEL,
} from "@/lib/labels";
import type { RequestStatus } from "@/lib/types";

/** Payment schedule of a project. Only an admin can change it; a project manager can read it. */
export function PaymentsPanel({ projectId }: { projectId: string }) {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const pay = usePayments(projectId);
  const save = useSavePayment();
  const del = useDeletePayment();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", amount: "", due_date: todayISO() });
  const [err, setErr] = useState<unknown>(null);
  const rows = pay.data ?? [];
  const total = rows.reduce((s, x) => s + Number(x.amount), 0);
  const paid = rows
    .filter((x) => x.status === "paid")
    .reduce((s, x) => s + Number(x.amount), 0);

  const add = () => {
    if (!f.title.trim() || !(Number(f.amount) > 0)) {
      setErr(new Error("اكتب اسم الدفعة ومبلغاً أكبر من صفر"));
      return;
    }
    save.mutate(
      {
        project_id: projectId,
        title: f.title.trim(),
        amount: Number(f.amount),
        due_date: f.due_date,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setF({ title: "", amount: "", due_date: todayISO() });
          setErr(null);
        },
        onError: (e) => setErr(e),
      },
    );
  };
  const toggle = (id: string, status: "pending" | "paid") =>
    save.mutate(
      { id, status: status === "paid" ? "pending" : "paid" } as never,
      { onError: (e) => toast((e as Error).message, "bad") },
    );

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <div className="num text-sm font-bold">
          الإجمالي {money(total)} · المدفوع {money(paid)} · المتبقي{" "}
          {money(total - paid)}
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> دفعة
          </Button>
        )}
      </div>
      {pay.isLoading ? (
        <Spinner />
      ) : !rows.length ? (
        <Empty>لا توجد دفعات.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>الدفعة</Th>
              <Th>الاستحقاق</Th>
              <Th>المبلغ</Th>
              <Th>الحالة</Th>
              {isAdmin && <Th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id} className="hover:bg-raised">
                <Td className="font-bold">{x.title}</Td>
                <Td className="num text-xs">{fmtDate(x.due_date)}</Td>
                <Td className="num font-extrabold">{money(x.amount)}</Td>
                <Td>
                  <Badge
                    tone={
                      x.status === "paid"
                        ? "ok"
                        : x.due_date < todayISO()
                          ? "bad"
                          : "warn"
                    }
                  >
                    {x.status === "paid"
                      ? "مدفوعة"
                      : x.due_date < todayISO()
                        ? "متأخرة"
                        : "مستحقة"}
                  </Badge>
                </Td>
                {isAdmin && (
                  <Td>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => toggle(x.id, x.status)}
                      >
                        {x.status === "paid" ? "إلغاء السداد" : "تسجيل سداد"}
                      </Button>
                      <button
                        aria-label="حذف"
                        className="rounded-lg p-2 text-bad hover:bg-raised"
                        onClick={() => {
                          if (confirm("حذف هذه الدفعة؟"))
                            del.mutate(x.id, {
                              onError: (e) =>
                                toast((e as Error).message, "bad"),
                            });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="إضافة دفعة"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button loading={save.isPending} onClick={add}>
              حفظ
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <Field label="اسم الدفعة / المستخلص">
            <Input
              value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value })}
              placeholder="الدفعة الأولى"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="المبلغ (ج.م.)">
              <Input
                dir="ltr"
                type="number"
                value={f.amount}
                onChange={(e) => setF({ ...f, amount: e.target.value })}
              />
            </Field>
            <Field label="تاريخ الاستحقاق">
              <Input
                type="date"
                value={f.due_date}
                onChange={(e) => setF({ ...f, due_date: e.target.value })}
              />
            </Field>
          </div>
          <ErrorNote error={err} />
        </div>
      </Modal>
    </Card>
  );
}

/** Client requests of a project (reply + status) and the client's stage ratings. */
export function RequestsPanel({ projectId }: { projectId: string }) {
  const toast = useToast();
  const reqs = useRequests(projectId);
  const ratings = useRatings(projectId);
  const approvals = useApprovals(projectId);
  const team = useTeam();
  const setStatus = useSetRequestStatus();
  const [openId, setOpenId] = useState<string | null>(null);
  const nameOf = (id: string) =>
    team.data?.find((p) => p.id === id)?.full_name ?? "—";
  const avg = ratings.data?.length
    ? (
        ratings.data.reduce((s, r) => s + r.rating, 0) / ratings.data.length
      ).toFixed(1)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h3 className="mb-2 font-extrabold">اعتمادات العميل للمراحل</h3>
        {!approvals.data?.length ? (
          <span className="text-xs text-muted">لا توجد قرارات بعد.</span>
        ) : (
          <ul className="divide-y divide-line">
            {approvals.data.map((a) => (
              <li
                key={a.id}
                className="flex items-start justify-between gap-3 py-2 text-sm"
              >
                <div>
                  <b>{STAGE_LABEL[a.stage]}</b>{" "}
                  <span className="text-xs text-muted">
                    · {nameOf(a.client_id)} · {fmtDate(a.created_at)}
                  </span>
                  {a.comment && (
                    <p className="mt-0.5 text-xs text-muted">{a.comment}</p>
                  )}
                </div>
                <Badge tone={a.decision === "approved" ? "ok" : "warn"}>
                  {a.decision === "approved" ? "اعتمد" : "طلب تعديل"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-extrabold">تقييمات العميل</h3>
          {avg && (
            <span className="num text-sm font-bold">المتوسط {avg} / 5</span>
          )}
        </div>
        {!ratings.data?.length ? (
          <span className="text-xs text-muted">لا توجد تقييمات بعد.</span>
        ) : (
          <ul className="divide-y divide-line">
            {ratings.data.map((r) => (
              <li
                key={r.id}
                className="flex items-start justify-between gap-3 py-2 text-sm"
              >
                <div>
                  <b>{STAGE_LABEL[r.stage]}</b>
                  {r.comment && (
                    <p className="mt-0.5 text-xs text-muted">{r.comment}</p>
                  )}
                </div>
                <Stars value={r.rating} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 font-extrabold">طلبات وملاحظات العميل</h3>
        {reqs.isLoading ? (
          <Spinner />
        ) : !reqs.data?.length ? (
          <Empty>لا توجد طلبات.</Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {reqs.data.map((r) => (
              <div key={r.id} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    className="text-start"
                    onClick={() => setOpenId(openId === r.id ? null : r.id)}
                  >
                    <div className="font-bold">{r.subject}</div>
                    <div className="text-xs text-muted">
                      {REQUEST_KIND_LABEL[r.kind]} · {nameOf(r.client_id)} ·{" "}
                      {fmtDate(r.created_at)}
                    </div>
                  </button>
                  <Select
                    className="!w-auto"
                    value={r.status}
                    aria-label="الحالة"
                    onChange={(e) =>
                      setStatus.mutate(
                        { id: r.id, status: e.target.value as RequestStatus },
                        {
                          onError: (er) => toast((er as Error).message, "bad"),
                        },
                      )
                    }
                  >
                    {Object.entries(REQUEST_STATUS_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </div>
                {openId === r.id && (
                  <div className="mt-3">
                    <RequestThread request={r} nameOf={nameOf} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
