import { useEffect, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileImage,
  Search,
  X,
} from "lucide-react";
import {
  EXPENSE_PAGE,
  fetchAllExpenses,
  useExpensesPage,
  useExpensesTotal,
  useProjects,
  useReviewExpense,
  useTeam,
  useWallets,
  type ExpenseQuery,
} from "@/hooks/useData";
import { downloadStorageFile, signedUrls } from "@/lib/imageUtils";
import {
  Badge,
  Button,
  Card,
  Empty,
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
import {
  useReturns,
  useReviewReturn,
  type CustodyReturn,
} from "@/hooks/useReturns";
import { downloadCSV, fmtDate, money } from "@/lib/format";
import { CATEGORY_LABEL, EXPENSE_STATUS_LABEL } from "@/lib/labels";
import type { Expense, ExpenseStatus } from "@/lib/types";

const TONE: Record<ExpenseStatus, "ok" | "warn" | "bad"> = {
  approved: "ok",
  pending_review: "warn",
  rejected: "bad",
};

export default function Expenses() {
  const toast = useToast();
  const [flt, setFlt] = useState<ExpenseQuery>({});
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  // Debounce the text search so each keystroke does not hit the database.
  useEffect(() => {
    const t = setTimeout(() => {
      setFlt((p) => ({ ...p, q: search.trim() || undefined }));
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);
  const expenses = useExpensesPage(flt, page);
  const totalQ = useExpensesTotal(flt);
  const projects = useProjects();
  const team = useTeam();
  const wallets = useWallets();
  const review = useReviewExpense();
  const returns = useReturns();
  const reviewReturn = useReviewReturn();
  const decideReturn = (x: CustodyReturn, status: ExpenseStatus) =>
    reviewReturn.mutate(
      { id: x.id, status },
      {
        onSuccess: () =>
          toast(
            status === "approved"
              ? "تم اعتماد المرتجع"
              : "تم رفض المرتجع وخصمه من العهدة",
          ),
        onError: (e) => toast((e as Error).message, "bad"),
      },
    );
  const [receipt, setReceipt] = useState<{ url: string; path: string } | null>(
    null,
  );

  // Only people who are currently site engineers hold a custody wallet card (someone moved to manager/client disappears from here).
  const engWallets = wallets.data?.filter(
    (w) =>
      team.data?.find((u) => u.id === w.engineer_id)?.role === "site_engineer",
  );
  const eng = (id: string) =>
    team.data?.find((p) => p.id === id)?.full_name ?? "—";
  const proj = (id: string | null) =>
    projects.data?.find((p) => p.id === id)?.title ?? "—";
  const setF = (k: keyof ExpenseQuery, v: string) => {
    setFlt((p) => ({ ...p, [k]: v || undefined }));
    setPage(0);
  };

  const rows = expenses.data?.rows ?? [];
  const count = expenses.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(count / EXPENSE_PAGE));
  const total = totalQ.data ?? 0;

  const decide = (x: Expense, status: ExpenseStatus) =>
    review.mutate(
      { id: x.id, status },
      {
        onSuccess: () =>
          toast(
            status === "approved"
              ? "تم اعتماد المصروف"
              : "تم رفض المصروف وإعادة المبلغ للعهدة",
          ),
        onError: (e) => toast((e as Error).message, "bad"),
      },
    );

  const showReceipt = async (path: string) => {
    const [url] = await signedUrls("receipts", [path]);
    if (url) setReceipt({ url, path });
    else toast("تعذّر تحميل الإيصال", "bad");
  };

  const exportCsv = async () => {
    let all;
    try {
      all = await fetchAllExpenses(flt);
    } catch (e) {
      toast((e as Error).message, "bad");
      return;
    }
    downloadCSV(`expenses-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["التاريخ", "المهندس", "الموقع", "الفئة", "التفاصيل", "المبلغ", "الحالة"],
      ...all.map((x) => [
        x.created_at.slice(0, 10),
        eng(x.engineer_id),
        proj(x.project_id),
        CATEGORY_LABEL[x.category],
        x.description ?? "",
        x.amount,
        EXPENSE_STATUS_LABEL[x.status],
      ]),
    ]);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-extrabold">المصروفات والعهد</h1>
        <Button
          variant="secondary"
          onClick={() => void exportCsv()}
          disabled={!rows.length}
        >
          <Download className="h-4 w-4" /> تصدير CSV
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          className="ps-9"
          placeholder="بحث في تفاصيل المصروف…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Field label="من تاريخ">
          <Input
            type="date"
            value={flt.from ?? ""}
            onChange={(e) => setF("from", e.target.value)}
          />
        </Field>
        <Field label="إلى تاريخ">
          <Input
            type="date"
            value={flt.to ?? ""}
            onChange={(e) => setF("to", e.target.value)}
          />
        </Field>
        <Field label="الموقع">
          <Select
            value={flt.projectId ?? ""}
            onChange={(e) => setF("projectId", e.target.value)}
          >
            <option value="">الكل</option>
            {projects.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="المهندس">
          <Select
            value={flt.engineerId ?? ""}
            onChange={(e) => setF("engineerId", e.target.value)}
          >
            <option value="">الكل</option>
            {team.data
              ?.filter((p) => p.role === "site_engineer")
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="الفئة">
          <Select
            value={flt.category ?? ""}
            onChange={(e) => setF("category", e.target.value)}
          >
            <option value="">الكل</option>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="الحالة">
          <Select
            value={flt.status ?? ""}
            onChange={(e) => setF("status", e.target.value)}
          >
            <option value="">الكل</option>
            {Object.entries(EXPENSE_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Card>
        {expenses.isLoading ? (
          <Spinner />
        ) : !rows.length ? (
          <Empty>لا توجد مصروفات مطابقة.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>التاريخ</Th>
                <Th>المهندس</Th>
                <Th>الموقع</Th>
                <Th>الفئة</Th>
                <Th>التفاصيل</Th>
                <Th>المبلغ</Th>
                <Th>إيصال</Th>
                <Th>الحالة</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id} className="hover:bg-raised">
                  <Td className="whitespace-nowrap text-xs">
                    {fmtDate(x.created_at)}
                  </Td>
                  <Td className="font-bold">{eng(x.engineer_id)}</Td>
                  <Td>{proj(x.project_id)}</Td>
                  <Td>
                    <Badge tone="info">{CATEGORY_LABEL[x.category]}</Badge>
                  </Td>
                  <Td className="max-w-[220px] truncate text-xs">
                    {x.description}
                  </Td>
                  <Td className="num font-extrabold">{money(x.amount)}</Td>
                  <Td>
                    {x.receipt_url ? (
                      <button
                        aria-label="عرض الإيصال"
                        onClick={() => void showReceipt(x.receipt_url!)}
                        className="rounded-lg p-2 text-brand hover:bg-raised"
                      >
                        <FileImage className="h-4 w-4" />
                      </button>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={TONE[x.status]}>
                      {EXPENSE_STATUS_LABEL[x.status]}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      {x.status !== "approved" && (
                        <Button
                          size="sm"
                          variant="ok"
                          onClick={() => decide(x, "approved")}
                        >
                          <Check className="h-3.5 w-3.5" />
                          اعتماد
                        </Button>
                      )}
                      {x.status !== "rejected" && (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => decide(x, "rejected")}
                        >
                          <X className="h-3.5 w-3.5" />
                          رفض
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {!!rows.length && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-sm">
            <span className="num font-bold">
              الإجمالي (بدون المرفوض): {money(total)} · {count} عملية
            </span>
            <span className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                aria-label="السابق"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="num text-xs font-bold">
                {page + 1} / {pages}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={page + 1 >= pages}
                onClick={() => setPage((p) => p + 1)}
                aria-label="التالي"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </span>
          </div>
        )}
      </Card>

      <section>
        <h2 className="mb-3 font-extrabold">مرتجعات العهد</h2>
        <Card>
          {returns.isLoading ? (
            <Spinner />
          ) : !returns.data?.length ? (
            <Empty>لا توجد مرتجعات.</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>التاريخ</Th>
                  <Th>المهندس</Th>
                  <Th>الموقع</Th>
                  <Th>التفاصيل</Th>
                  <Th>المبلغ</Th>
                  <Th>إيصال</Th>
                  <Th>الحالة</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {returns.data.map((x) => (
                  <tr key={x.id} className="hover:bg-raised">
                    <Td className="whitespace-nowrap text-xs">
                      {fmtDate(x.created_at)}
                    </Td>
                    <Td className="font-bold">{eng(x.engineer_id)}</Td>
                    <Td>{proj(x.project_id)}</Td>
                    <Td className="max-w-[220px] truncate text-xs">
                      {x.description}
                    </Td>
                    <Td className="num font-extrabold text-ok">
                      +{money(x.amount)}
                    </Td>
                    <Td>
                      {x.receipt_url ? (
                        <button
                          aria-label="عرض الإيصال"
                          onClick={() => void showReceipt(x.receipt_url!)}
                          className="rounded-lg p-2 text-brand hover:bg-raised"
                        >
                          <FileImage className="h-4 w-4" />
                        </button>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={TONE[x.status]}>
                        {EXPENSE_STATUS_LABEL[x.status]}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex gap-1">
                        {x.status !== "approved" && (
                          <Button
                            size="sm"
                            variant="ok"
                            onClick={() => decideReturn(x, "approved")}
                          >
                            <Check className="h-3.5 w-3.5" />
                            اعتماد
                          </Button>
                        )}
                        {x.status !== "rejected" && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => decideReturn(x, "rejected")}
                          >
                            <X className="h-3.5 w-3.5" />
                            رفض
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </section>

      <section>
        <h2 className="mb-3 font-extrabold">أرصدة العهد</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {engWallets?.map((w) => (
            <Card key={w.id} className="p-4">
              <div className="text-sm font-bold">{eng(w.engineer_id)}</div>
              <div className="num mt-1 text-xl font-black">
                {money(w.current_balance)}
              </div>
              <div className="num text-[11px] text-muted">
                من أصل {money(w.total_disbursed)}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <Modal
        open={!!receipt}
        onClose={() => setReceipt(null)}
        title="صورة الإيصال"
        footer={
          <Button
            onClick={() =>
              receipt &&
              downloadStorageFile(
                "receipts",
                receipt.path,
                `receipt-${receipt.path.split("/").pop()}`,
              ).catch((e) => toast((e as Error).message, "bad"))
            }
          >
            <Download className="h-4 w-4" /> تنزيل الإيصال
          </Button>
        }
      >
        {receipt && (
          <img
            src={receipt.url}
            alt="إيصال المصروف"
            className="mx-auto max-h-[70vh] rounded-lg"
          />
        )}
      </Modal>
    </div>
  );
}
