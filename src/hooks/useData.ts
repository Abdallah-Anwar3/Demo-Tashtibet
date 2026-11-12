import { useEffect, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayISO } from "@/lib/format";
import { pushIsOn } from "@/lib/push";
import type {
  AppNotification,
  Attendance,
  AuditEntry,
  ClientProject,
  ClientUpdate,
  ClientRequest,
  CustodyWallet,
  DailyReport,
  Expense,
  ExpenseStatus,
  PayrollRecord,
  Profile,
  Project,
  ProjectPayment,
  RequestMessage,
  RequestStatus,
  StageHistory,
  StageRating,
} from "@/lib/types";

const unwrap = <T>(r: {
  data: T | null;
  error: { message: string } | null;
}): T => {
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? ([] as unknown)) as T;
};

/* ───────────── reads ───────────── */

export const useProjects = () =>
  useQuery({
    queryKey: ["projects"],
    queryFn: async () =>
      unwrap<Project[]>(
        await supabase
          .from("projects")
          .select("*")
          .order("created_at", { ascending: false }),
      ),
  });

export const useTeam = () =>
  useQuery({
    queryKey: ["team"],
    queryFn: async () =>
      unwrap<Profile[]>(
        await supabase.from("profiles").select("*").order("created_at"),
      ),
  });

export const useWallets = () =>
  useQuery({
    queryKey: ["wallets"],
    queryFn: async () =>
      unwrap<CustodyWallet[]>(
        await supabase.from("custody_wallets").select("*"),
      ),
  });

export const useMyWallet = (engineerId?: string) =>
  useQuery({
    queryKey: ["wallet", engineerId],
    enabled: !!engineerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custody_wallets")
        .select("*")
        .eq("engineer_id", engineerId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as CustodyWallet | null;
    },
  });

export interface ExpenseFilters {
  projectId?: string;
  engineerId?: string;
  category?: string;
  status?: string;
  from?: string;
  to?: string;
}

export interface ExpenseQuery extends ExpenseFilters {
  q?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const applyExpenseFilters = <
  Q extends { eq: any; gte: any; lte: any; ilike: any },
>(
  q: Q,
  f: ExpenseQuery,
): Q => {
  let r = q;
  if (f.projectId) r = r.eq("project_id", f.projectId);
  if (f.engineerId) r = r.eq("engineer_id", f.engineerId);
  if (f.category) r = r.eq("category", f.category);
  if (f.status) r = r.eq("status", f.status);
  if (f.from) r = r.gte("created_at", f.from);
  if (f.to) r = r.lte("created_at", `${f.to}T23:59:59`);
  if (f.q?.trim()) r = r.ilike("description", `%${f.q.trim()}%`);
  return r;
};

/** Latest 500 matching expenses (small lists: dashboard, project page). */
export const useExpenses = (f: ExpenseQuery = {}) =>
  useQuery({
    queryKey: ["expenses", f],
    queryFn: async () =>
      unwrap<Expense[]>(
        await applyExpenseFilters(
          supabase
            .from("expenses")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(500),
          f,
        ),
      ),
  });

export const EXPENSE_PAGE = 25;

/** Server-side pagination for the audit table. */
export const useExpensesPage = (f: ExpenseQuery, page: number) =>
  useQuery({
    queryKey: ["expenses-page", f, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await applyExpenseFilters(
        supabase
          .from("expenses")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(page * EXPENSE_PAGE, (page + 1) * EXPENSE_PAGE - 1),
        f,
      );
      if (r.error) throw new Error(r.error.message);
      return {
        rows: (r.data ?? []) as Expense[],
        count: (r.count ?? 0) as number,
      };
    },
  });

/** Total of ALL matching expenses (not only the visible page), rejected excluded. */
export const useExpensesTotal = (f: ExpenseQuery) =>
  useQuery({
    queryKey: ["expenses-total", f],
    queryFn: async () => {
      const rows = unwrap<Pick<Expense, "amount" | "status">[]>(
        await applyExpenseFilters(
          supabase.from("expenses").select("amount,status").limit(10000),
          f,
        ),
      );
      return rows
        .filter((r) => r.status !== "rejected")
        .reduce((s, r) => s + Number(r.amount), 0);
    },
  });

/** Every matching row (up to 10,000) for CSV export. */
export async function fetchAllExpenses(f: ExpenseQuery): Promise<Expense[]> {
  const out: Expense[] = [];
  for (let from = 0; from < 10000; from += 1000) {
    const rows = unwrap<Expense[]>(
      await applyExpenseFilters(
        supabase
          .from("expenses")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, from + 999),
        f,
      ),
    );
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export interface ReportQuery {
  date?: string;
  projectId?: string;
  engineerId?: string;
  limit?: number;
}

export const useReports = (f: ReportQuery = {}) =>
  useQuery({
    queryKey: ["reports", f],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from("daily_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(f.limit ?? 20);
      if (f.date) q = q.eq("date", f.date);
      if (f.projectId) q = q.eq("project_id", f.projectId);
      if (f.engineerId) q = q.eq("engineer_id", f.engineerId);
      return unwrap<DailyReport[]>(await q);
    },
  });

export const useAttendance = (
  opts: { date?: string; engineerId?: string; projectId?: string } = {},
) =>
  useQuery({
    queryKey: ["attendance", opts],
    queryFn: async () => {
      let q = supabase
        .from("attendance")
        .select("*")
        .order("check_in_time", { ascending: false })
        .limit(300);
      if (opts.date) q = q.eq("date", opts.date);
      if (opts.engineerId) q = q.eq("engineer_id", opts.engineerId);
      if (opts.projectId) q = q.eq("project_id", opts.projectId);
      return unwrap<Attendance[]>(await q);
    },
  });

export const usePayroll = (month: number, year: number) =>
  useQuery({
    queryKey: ["payroll", month, year],
    queryFn: async () =>
      unwrap<PayrollRecord[]>(
        await supabase
          .from("payroll_records")
          .select("*")
          .eq("month", month)
          .eq("year", year),
      ),
  });

/** Month-to-date expenses (approved + pending) for the dashboard KPI. */
export const useMonthExpenseTotal = () =>
  useQuery({
    queryKey: ["month-expenses"],
    queryFn: async () => {
      const start = `${todayISO().slice(0, 8)}01`;
      const rows = unwrap<Pick<Expense, "amount" | "status" | "project_id">[]>(
        await supabase
          .from("expenses")
          .select("amount,status,project_id")
          .gte("created_at", start)
          .neq("status", "rejected"),
      );
      return rows;
    },
  });

/** Total spent per project (approved + pending), for budget vs actual. */
export const useSpendByProject = () =>
  useQuery({
    queryKey: ["spend-by-project"],
    queryFn: async () => {
      const rows = unwrap<Pick<Expense, "amount" | "project_id">[]>(
        await supabase
          .from("expenses")
          .select("amount,project_id")
          .neq("status", "rejected"),
      );
      const map: Record<string, number> = {};
      rows.forEach((r) => {
        if (r.project_id)
          map[r.project_id] = (map[r.project_id] ?? 0) + Number(r.amount);
      });
      return map;
    },
  });

/* ───────────── mutations ───────────── */

function useInvalidating<TArgs, TRes>(
  fn: (a: TArgs) => Promise<TRes>,
  keys: string[],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      keys.forEach((k) => void qc.invalidateQueries({ queryKey: [k] })),
  });
}

export const useReviewExpense = () =>
  useInvalidating(
    async ({ id, status }: { id: string; status: ExpenseStatus }) => {
      const { error } = await supabase
        .from("expenses")
        .update({ status })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    [
      "expenses",
      "expenses-page",
      "expenses-total",
      "wallets",
      "wallet",
      "month-expenses",
      "spend-by-project",
      "notifications",
    ],
  );

export const useDisburseCustody = () =>
  useInvalidating(
    async ({ engineerId, amount }: { engineerId: string; amount: number }) => {
      const { error } = await supabase.rpc("disburse_custody", {
        p_engineer: engineerId,
        p_amount: amount,
      });
      if (error) throw new Error(error.message);
    },
    ["wallets", "wallet"],
  );

export const useSaveProject = () =>
  useInvalidating(
    async (p: Partial<Project> & { title: string; client_name: string }) => {
      const { id, ...rest } = p;
      const r = id
        ? await supabase.from("projects").update(rest).eq("id", id)
        : await supabase.from("projects").insert(rest);
      if (r.error) throw new Error(r.error.message);
    },
    ["projects"],
  );

export const useCalculatePayroll = () =>
  useInvalidating(
    async ({ month, year }: { month: number; year: number }) => {
      const { data, error } = await supabase.rpc("calculate_payroll", {
        p_month: month,
        p_year: year,
      });
      if (error) throw new Error(error.message);
      return data as number;
    },
    ["payroll"],
  );

export const useUpdatePayroll = () =>
  useInvalidating(
    async ({ id, ...patch }: Partial<PayrollRecord> & { id: string }) => {
      const { error } = await supabase
        .from("payroll_records")
        .update(patch)
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    ["payroll"],
  );

export interface UserInput {
  id?: string;
  email?: string;
  password?: string;
  full_name: string;
  phone?: string;
  role: Profile["role"];
  base_salary: number;
  site_allowance_rate: number;
  is_active?: boolean;
  project_ids?: string[];
  opening_custody?: number;
}

/** All account changes go through the admin-users Edge Function (needs the service role). */
export const useAdminUsers = () => {
  const qc = useQueryClient();
  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body,
    });
    if (error) {
      // surface the Arabic message the function returned, when there is one
      const ctx = (error as unknown as { context?: Response }).context;
      const msg = ctx
        ? await ctx
            .json()
            .then((j) => j?.error)
            .catch(() => null)
        : null;
      throw new Error(msg ?? error.message);
    }
    if (data?.error) throw new Error(data.error);
    void qc.invalidateQueries({ queryKey: ["team"] });
    void qc.invalidateQueries({ queryKey: ["projects"] });
    void qc.invalidateQueries({ queryKey: ["wallets"] });
    return data;
  };
  return {
    create: (u: UserInput) => call({ action: "create", ...u }),
    update: (u: UserInput) => call({ action: "update", ...u }),
    remove: (id: string) => call({ action: "delete", id }),
  };
};

/* ───────────── realtime live feed ───────────── */

export interface FeedItem {
  id: string;
  kind: "attendance" | "report" | "expense";
  at: string;
  engineerId: string;
  projectId: string | null;
  detail?: string;
}

/** Streams new check-ins, reports and expenses as they are inserted. */
export function useLiveFeed(limit = 12) {
  const [items, setItems] = useState<FeedItem[]>([]);
  useEffect(() => {
    const push = (it: FeedItem) => setItems((p) => [it, ...p].slice(0, limit));
    const ch = supabase
      .channel("live-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "attendance" },
        (e) => {
          const r = e.new as Attendance;
          push({
            id: r.id,
            kind: "attendance",
            at: r.check_in_time,
            engineerId: r.engineer_id,
            projectId: r.project_id,
            detail: r.is_within_geofence ? "داخل الموقع" : "خارج الموقع",
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "daily_reports" },
        (e) => {
          const r = e.new as DailyReport;
          push({
            id: r.id,
            kind: "report",
            at: r.created_at,
            engineerId: r.engineer_id,
            projectId: r.project_id,
            detail: `${r.photos_urls?.length ?? 0} صور`,
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "expenses" },
        (e) => {
          const r = e.new as Expense;
          push({
            id: r.id,
            kind: "expense",
            at: r.created_at,
            engineerId: r.engineer_id,
            projectId: r.project_id,
            detail: `${Number(r.amount).toLocaleString("en-US")} ج`,
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [limit]);
  return items;
}

/* ───────────── project detail, audit, notifications ───────────── */

export const useStageHistory = (projectId?: string) =>
  useQuery({
    queryKey: ["stage-history", projectId],
    enabled: !!projectId,
    queryFn: async () =>
      unwrap<StageHistory[]>(
        await supabase
          .from("project_stage_history")
          .select("*")
          .eq("project_id", projectId!)
          .order("changed_at"),
      ),
  });

export const AUDIT_PAGE = 30;

export const useAuditLog = (page: number) =>
  useQuery({
    queryKey: ["audit", page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await supabase
        .from("audit_log")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * AUDIT_PAGE, (page + 1) * AUDIT_PAGE - 1);
      if (r.error) throw new Error(r.error.message);
      return {
        rows: (r.data ?? []) as AuditEntry[],
        count: (r.count ?? 0) as number,
      };
    },
  });

/** Managers' inbox. New rows arrive live; the browser notifies when the tab is in the background. */
export function useNotifications(userId?: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notifications"],
    enabled: !!userId,
    queryFn: async () =>
      unwrap<AppNotification[]>(
        await supabase
          .from("notifications")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(30),
      ),
  });

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`notif-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (e) => {
          void qc.invalidateQueries({ queryKey: ["notifications"] });
          const n = e.new as AppNotification;
          if (
            "Notification" in window &&
            Notification.permission === "granted" &&
            !pushIsOn() &&
            document.visibilityState !== "visible"
          ) {
            new Notification(n.title, {
              body: n.body ?? undefined,
              icon: "/icons/icon-192.png",
              tag: n.id,
            });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [userId, qc]);

  return q;
}

export const useMarkRead = () =>
  useInvalidating(
    async (ids: string[] | "all") => {
      const base = supabase.from("notifications").update({ is_read: true });
      const { error } =
        ids === "all"
          ? await base.eq("is_read", false)
          : await base.in("id", ids);
      if (error) throw new Error(error.message);
    },
    ["notifications"],
  );

/* ───────────── client portal ───────────── */

/** Which client accounts see which project (admin / project manager view). */
export const useProjectClients = () =>
  useQuery({
    queryKey: ["project-clients"],
    queryFn: async () =>
      unwrap<{ project_id: string; client_id: string }[]>(
        await supabase.from("project_clients").select("project_id,client_id"),
      ),
  });

/** Curated numbers for the signed-in client (server decides what is included). */
export const useClientDashboard = () =>
  useQuery({
    queryKey: ["client-dashboard"],
    queryFn: async () => {
      const r = await supabase.rpc("client_dashboard");
      if (r.error) throw new Error(r.error.message);
      return (r.data ?? []) as ClientProject[];
    },
  });

/** Published updates. RLS shows a client only its own projects' updates. */
export const useClientUpdates = (
  opts: { projectId?: string; limit?: number } = {},
) =>
  useQuery({
    queryKey: ["client-updates", opts],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from("client_updates")
        .select("*")
        .order("date", { ascending: false })
        .limit(opts.limit ?? 20);
      if (opts.projectId) q = q.eq("project_id", opts.projectId);
      return unwrap<ClientUpdate[]>(await q);
    },
  });

export const useSaveClientUpdate = () =>
  useInvalidating(
    async (u: {
      project_id: string;
      date: string;
      summary: string;
      next_steps: string | null;
      photos: string[];
      published_by: string;
    }) => {
      const r = await supabase
        .from("client_updates")
        .upsert(
          { ...u, published_at: new Date().toISOString() },
          { onConflict: "project_id,date" },
        )
        .select("id")
        .single();
      if (r.error) throw new Error(r.error.message);
      return r.data.id as string;
    },
    ["client-updates"],
  );

/** Emails an already-published update to the project's clients (Edge Function). */
export const useSendClientUpdate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updateId: string) => {
      const { data, error } = await supabase.functions.invoke(
        "send-client-update",
        { body: { update_id: updateId } },
      );
      if (error) {
        const ctx = (error as unknown as { context?: Response }).context;
        const msg = ctx
          ? await ctx
              .json()
              .then((j) => j?.error)
              .catch(() => null)
          : null;
        throw new Error(msg ?? error.message);
      }
      if (data?.error) throw new Error(data.error);
      return data as { sent: number; failed: number };
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["client-updates"] }),
  });
};

/* ───────────── payments, requests, ratings ───────────── */

export const usePayments = (projectId?: string) =>
  useQuery({
    queryKey: ["payments", projectId],
    queryFn: async () => {
      let q = supabase.from("project_payments").select("*").order("due_date");
      if (projectId) q = q.eq("project_id", projectId);
      return unwrap<ProjectPayment[]>(await q);
    },
  });

export const useSavePayment = () =>
  useInvalidating(
    async (
      p: Partial<ProjectPayment> & {
        project_id: string;
        title: string;
        amount: number;
        due_date: string;
      },
    ) => {
      const { id, ...rest } = p;
      const r = id
        ? await supabase.from("project_payments").update(rest).eq("id", id)
        : await supabase.from("project_payments").insert(rest);
      if (r.error) throw new Error(r.error.message);
    },
    ["payments", "client-dashboard"],
  );

export const useDeletePayment = () =>
  useInvalidating(
    async (id: string) => {
      const r = await supabase.from("project_payments").delete().eq("id", id);
      if (r.error) throw new Error(r.error.message);
    },
    ["payments", "client-dashboard"],
  );

export const useRequests = (projectId?: string) =>
  useQuery({
    queryKey: ["requests", projectId],
    queryFn: async () => {
      let q = supabase
        .from("client_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (projectId) q = q.eq("project_id", projectId);
      return unwrap<ClientRequest[]>(await q);
    },
  });

export const useRequestMessages = (requestId?: string) =>
  useQuery({
    queryKey: ["request-messages", requestId],
    enabled: !!requestId,
    queryFn: async () =>
      unwrap<RequestMessage[]>(
        await supabase
          .from("client_request_messages")
          .select("*")
          .eq("request_id", requestId!)
          .order("created_at"),
      ),
  });

export const useCreateRequest = () =>
  useInvalidating(
    async (r: {
      project_id: string;
      client_id: string;
      kind: string;
      subject: string;
      body: string;
    }) => {
      const x = await supabase.from("client_requests").insert(r);
      if (x.error) throw new Error(x.error.message);
    },
    ["requests"],
  );

export const useSendRequestMessage = () =>
  useInvalidating(
    async (m: { request_id: string; author_id: string; body: string }) => {
      const x = await supabase.from("client_request_messages").insert(m);
      if (x.error) throw new Error(x.error.message);
    },
    ["request-messages", "requests"],
  );

export const useSetRequestStatus = () =>
  useInvalidating(
    async ({ id, status }: { id: string; status: RequestStatus }) => {
      const x = await supabase
        .from("client_requests")
        .update({ status })
        .eq("id", id);
      if (x.error) throw new Error(x.error.message);
    },
    ["requests"],
  );

export const useRatings = (projectId?: string) =>
  useQuery({
    queryKey: ["ratings", projectId],
    queryFn: async () => {
      let q = supabase
        .from("stage_ratings")
        .select("*")
        .order("created_at", { ascending: false });
      if (projectId) q = q.eq("project_id", projectId);
      return unwrap<StageRating[]>(await q);
    },
  });

export const useRateStage = () =>
  useInvalidating(
    async (r: {
      project_id: string;
      stage: string;
      client_id: string;
      rating: number;
      comment: string | null;
    }) => {
      const x = await supabase.from("stage_ratings").insert(r);
      if (x.error) throw new Error(x.error.message);
    },
    ["ratings"],
  );
