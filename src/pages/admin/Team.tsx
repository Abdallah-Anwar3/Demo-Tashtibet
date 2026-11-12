import { FEATURES } from "@/lib/features";
import { useState } from "react";
import { Banknote, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  useAdminUsers,
  useDisburseCustody,
  useProjectClients,
  useProjects,
  useTeam,
  useWallets,
  type UserInput,
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
import { money } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { Profile, Role } from "@/lib/types";

/** Clients and the system admin have no salary or site allowance. */
const noPay = (r: Role) => r === "client" || r === "admin";
const blank = {
  email: "",
  password: "",
  full_name: "",
  phone: "",
  role: "site_engineer" as Role,
  base_salary: "",
  rate: "",
  opening: "",
  project_ids: [] as string[],
};

export default function Team() {
  const { profile: me } = useAuth();
  const toast = useToast();
  const team = useTeam();
  const projects = useProjects();
  const wallets = useWallets();
  const users = useAdminUsers();
  const disburse = useDisburseCustody();
  const links = useProjectClients();

  const [editing, setEditing] = useState<Profile | "new" | null>(null);
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [confirmDel, setConfirmDel] = useState<Profile | null>(null);
  const [topUp, setTopUp] = useState<Profile | null>(null);
  const [amount, setAmount] = useState("");

  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) =>
    setF((p) => ({ ...p, [k]: v }));
  const assignedTo = (u: Profile) =>
    u.role === "client"
      ? (links.data
          ?.filter((l) => l.client_id === u.id)
          .map((l) => l.project_id) ?? [])
      : (projects.data
          ?.filter((p) => p.assigned_engineer_ids.includes(u.id))
          .map((p) => p.id) ?? []);

  const open = (u?: Profile) => {
    setErr(null);
    setF(
      u
        ? {
            ...blank,
            email: "",
            full_name: u.full_name,
            phone: u.phone ?? "",
            role: u.role,
            base_salary: String(u.base_salary),
            rate: String(u.site_allowance_rate),
            project_ids: assignedTo(u),
          }
        : blank,
    );
    setEditing(u ?? "new");
  };

  const submit = async () => {
    const isNew = editing === "new";
    if (!f.full_name.trim()) {
      setErr(new Error("الاسم مطلوب"));
      return;
    }
    if (isNew && (!f.email.trim() || f.password.length < 8)) {
      setErr(new Error("البريد مطلوب وكلمة المرور 8 أحرف على الأقل"));
      return;
    }
    if (!isNew && f.password && f.password.length < 8) {
      setErr(new Error("كلمة المرور الجديدة 8 أحرف على الأقل"));
      return;
    }
    const body: UserInput = {
      full_name: f.full_name.trim(),
      phone: f.phone.trim(),
      role: f.role,
      base_salary: noPay(f.role) ? 0 : Number(f.base_salary) || 0,
      site_allowance_rate: noPay(f.role) ? 0 : Number(f.rate) || 0,
      project_ids: f.project_ids,
    };
    setBusy(true);
    setErr(null);
    try {
      if (isNew)
        await users.create({
          ...body,
          email: f.email.trim(),
          password: f.password,
          opening_custody: Number(f.opening) || 0,
        });
      else {
        const u = editing as Profile;
        await users.update({
          ...body,
          id: u.id,
          is_active: u.is_active,
          ...(f.email.trim() ? { email: f.email.trim() } : {}),
          ...(f.password ? { password: f.password } : {}),
        });
      }
      toast(isNew ? "تم إنشاء الحساب" : "تم حفظ التعديلات");
      setEditing(null);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (u: Profile) => {
    try {
      await users.update({
        id: u.id,
        full_name: u.full_name,
        phone: u.phone ?? "",
        role: u.role,
        base_salary: u.base_salary,
        site_allowance_rate: u.site_allowance_rate,
        is_active: !u.is_active,
      });
      toast(u.is_active ? "تم إيقاف الحساب" : "تم تفعيل الحساب");
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };

  const remove = async () => {
    if (!confirmDel) return;
    try {
      await users.remove(confirmDel.id);
      toast("تم حذف الحساب");
      setConfirmDel(null);
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };

  const doTopUp = () => {
    if (!topUp || !(Number(amount) > 0)) return;
    disburse.mutate(
      { engineerId: topUp.id, amount: Number(amount) },
      {
        onSuccess: () => {
          toast("تم صرف العهدة");
          setTopUp(null);
          setAmount("");
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-extrabold">الفريق والحسابات</h1>
        <Button onClick={() => open()}>
          <Plus className="h-4 w-4" /> إضافة مستخدم
        </Button>
      </div>

      <Card>
        {team.isLoading ? (
          <Spinner />
        ) : !team.data?.length ? (
          <Empty>لا يوجد مستخدمون.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>الاسم</Th>
                <Th>الدور</Th>
                <Th>البريد</Th>
                <Th>الهاتف</Th>
                <Th>الراتب الأساسي</Th>
                <Th>بدل اليوم الميداني</Th>
                <Th>رصيد العهدة</Th>
                <Th>الحالة</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {team.data
                .filter((u) => FEATURES.clientPortal || u.role !== "client")
                .map((u) => {
                  const w = wallets.data?.find((x) => x.engineer_id === u.id);
                  const self = u.id === me?.id;
                  return (
                    <tr
                      key={u.id}
                      className={cn(
                        "hover:bg-raised",
                        !u.is_active && "opacity-60",
                      )}
                    >
                      <Td className="font-bold">
                        {u.full_name}
                        {self && (
                          <span className="ms-2 text-[10px] text-muted">
                            (أنت)
                          </span>
                        )}
                      </Td>
                      <Td>
                        <Badge
                          tone={
                            u.role === "admin"
                              ? "brand"
                              : u.role === "project_manager"
                                ? "info"
                                : u.role === "client"
                                  ? "warn"
                                  : "gray"
                          }
                        >
                          {ROLE_LABEL[u.role]}
                        </Badge>
                      </Td>
                      <Td className="text-xs">
                        <span dir="ltr">{u.email ?? "-"}</span>
                      </Td>
                      <Td className="num text-xs">
                        <span dir="ltr">{u.phone ?? "-"}</span>
                      </Td>
                      <Td className="num">
                        {noPay(u.role) ? "—" : money(u.base_salary)}
                      </Td>
                      <Td className="num">
                        {noPay(u.role) ? "—" : money(u.site_allowance_rate)}
                      </Td>
                      <Td className="num font-bold">
                        {u.role === "site_engineer"
                          ? money(w?.current_balance)
                          : "—"}
                      </Td>
                      <Td>
                        <Badge tone={u.is_active ? "ok" : "bad"}>
                          {u.is_active ? "نشط" : "موقوف"}
                        </Badge>
                      </Td>
                      <Td>
                        <div className="flex gap-0.5">
                          {u.role === "site_engineer" && (
                            <button
                              title="صرف عهدة"
                              onClick={() => {
                                setTopUp(u);
                                setAmount("");
                                disburse.reset();
                              }}
                              className="rounded-lg p-2 text-muted hover:bg-raised hover:text-brand"
                            >
                              <Banknote className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            title="تعديل"
                            onClick={() => open(u)}
                            className="rounded-lg p-2 text-muted hover:bg-raised"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {!self && (
                            <button
                              title={u.is_active ? "إيقاف" : "تفعيل"}
                              onClick={() => void toggleActive(u)}
                              className="rounded-lg p-2 text-muted hover:bg-raised"
                            >
                              {u.is_active ? (
                                <Pause className="h-4 w-4" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                            </button>
                          )}
                          {!self && (
                            <button
                              title="حذف"
                              onClick={() => setConfirmDel(u)}
                              className="rounded-lg p-2 text-muted hover:bg-bad-soft hover:text-bad"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "إضافة مستخدم جديد" : "تعديل المستخدم"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              إلغاء
            </Button>
            <Button loading={busy} onClick={submit}>
              حفظ
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <Field label="الاسم الكامل *">
            <Input
              value={f.full_name}
              onChange={(e) => set("full_name", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={
                editing === "new"
                  ? "البريد الإلكتروني *"
                  : "بريد جديد (اختياري)"
              }
            >
              <Input
                dir="ltr"
                type="email"
                autoComplete="off"
                value={f.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </Field>
            <Field
              label={
                editing === "new"
                  ? "كلمة المرور *"
                  : "كلمة مرور جديدة (اختياري)"
              }
              hint="8 أحرف على الأقل"
            >
              <Input
                dir="ltr"
                type="text"
                autoComplete="new-password"
                value={f.password}
                onChange={(e) => set("password", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="الهاتف">
              <Input
                dir="ltr"
                value={f.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </Field>
            <Field label="الدور">
              <Select
                value={f.role}
                onChange={(e) => set("role", e.target.value as Role)}
              >
                {Object.entries(ROLE_LABEL)
                  .filter(([k]) => FEATURES.clientPortal || k !== "client")
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="الراتب الأساسي">
              <Input
                dir="ltr"
                type="number"
                disabled={noPay(f.role)}
                value={noPay(f.role) ? "" : f.base_salary}
                onChange={(e) => set("base_salary", e.target.value)}
              />
            </Field>
            <Field label="بدل نزول (لليوم الميداني)">
              <Input
                dir="ltr"
                type="number"
                disabled={noPay(f.role)}
                value={noPay(f.role) ? "" : f.rate}
                onChange={(e) => set("rate", e.target.value)}
              />
            </Field>
          </div>
          {editing === "new" && f.role === "site_engineer" && (
            <Field label="عهدة افتتاحية (اختياري)">
              <Input
                dir="ltr"
                type="number"
                value={f.opening}
                onChange={(e) => set("opening", e.target.value)}
              />
            </Field>
          )}
          {(f.role === "site_engineer" || f.role === "client") && (
            <div>
              <div className="mb-2 text-xs font-bold text-muted">
                {f.role === "client"
                  ? "مشاريع العميل (يراها فقط)"
                  : "المواقع المسندة"}
              </div>
              <div className="flex flex-wrap gap-2">
                {projects.data?.map((p) => (
                  <label
                    key={p.id}
                    className={cn(
                      "cursor-pointer rounded-full border px-3 py-1.5 text-xs font-bold",
                      f.project_ids.includes(p.id)
                        ? "border-brand bg-brand-soft text-brand-dark"
                        : "border-line text-muted",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={f.project_ids.includes(p.id)}
                      onChange={() =>
                        set(
                          "project_ids",
                          f.project_ids.includes(p.id)
                            ? f.project_ids.filter((x) => x !== p.id)
                            : [...f.project_ids, p.id],
                        )
                      }
                    />
                    {p.title}
                  </label>
                ))}
                {!projects.data?.length && (
                  <span className="text-xs text-muted">
                    لا توجد مشاريع بعد.
                  </span>
                )}
              </div>
            </div>
          )}
          <ErrorNote error={err} />
        </div>
      </Modal>

      <Modal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title="تأكيد الحذف"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDel(null)}>
              تراجع
            </Button>
            <Button variant="danger" onClick={() => void remove()}>
              حذف نهائي
            </Button>
          </>
        }
      >
        <p className="text-sm">
          سيتم حذف حساب <b>{confirmDel?.full_name}</b> نهائياً مع سجلاته (الحضور
          والتقارير والمصروفات). إذا أردت الاحتفاظ بالسجلات فاستخدم «إيقاف» بدل
          الحذف.
        </p>
      </Modal>

      <Modal
        open={!!topUp}
        onClose={() => setTopUp(null)}
        title={`صرف عهدة — ${topUp?.full_name ?? ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTopUp(null)}>
              إلغاء
            </Button>
            <Button loading={disburse.isPending} onClick={doTopUp}>
              صرف
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="المبلغ (ج.م.)">
            <Input
              dir="ltr"
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </Field>
          <ErrorNote error={disburse.error} />
        </div>
      </Modal>
    </div>
  );
}
