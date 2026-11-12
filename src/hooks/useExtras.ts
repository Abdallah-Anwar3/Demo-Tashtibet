import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/* ───────── types ───────── */
export interface Milestone {
  id: string;
  project_id: string;
  title: string;
  start_date: string;
  end_date: string;
  done_at: string | null;
  visible_to_client: boolean;
}
export interface Supplier {
  id: string;
  name: string;
  trade: string | null;
  phone: string | null;
  rating: number | null;
  notes: string | null;
  is_active: boolean;
}
export interface SupplierInvoice {
  id: string;
  supplier_id: string;
  project_id: string | null;
  amount: number;
  paid_amount: number;
  invoice_date: string;
  note: string | null;
}
export interface MaterialStock {
  id: string;
  project_id: string;
  name: string;
  unit: string;
  min_qty: number;
  qty_in: number;
  qty_out: number;
  qty_waste: number;
  balance: number;
}
export interface StockMove {
  id: string;
  material_id: string;
  kind: "in" | "out" | "waste";
  qty: number;
  note: string | null;
  moved_on: string;
  created_at: string;
}
export interface FinanceRow {
  project_id: string;
  title: string;
  client_name: string;
  status: string;
  budget: number;
  spent: number;
  pending: number;
  client_total: number;
  client_paid: number;
  supplier_due: number;
}

const rows = <T>(r: {
  data: unknown;
  error: { message: string } | null;
}): T[] => {
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as T[];
};
const check = (r: { error: { message: string } | null }) => {
  if (r.error) throw new Error(r.error.message);
};

function useWrite<A>(fn: (a: A) => Promise<void>, keys: string[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      keys.forEach((k) => void qc.invalidateQueries({ queryKey: [k] })),
  });
}

/* ───────── schedule ───────── */
export const useMilestones = (projectId?: string) =>
  useQuery({
    queryKey: ["milestones", projectId],
    enabled: !!projectId,
    queryFn: async () =>
      rows<Milestone>(
        await supabase
          .from("project_milestones")
          .select("*")
          .eq("project_id", projectId!)
          .order("start_date"),
      ),
  });

export const useSaveMilestone = () =>
  useWrite(
    async (
      m: Partial<Milestone> & {
        project_id: string;
        title: string;
        start_date: string;
        end_date: string;
      },
    ) => {
      const { id, ...rest } = m;
      check(
        id
          ? await supabase.from("project_milestones").update(rest).eq("id", id)
          : await supabase.from("project_milestones").insert(rest),
      );
    },
    ["milestones"],
  );

export const useDeleteMilestone = () =>
  useWrite(
    async (id: string) => {
      check(await supabase.from("project_milestones").delete().eq("id", id));
    },
    ["milestones"],
  );

/* ───────── suppliers ───────── */
export const useSuppliers = () =>
  useQuery({
    queryKey: ["suppliers"],
    queryFn: async () =>
      rows<Supplier>(
        await supabase.from("suppliers").select("*").order("name"),
      ),
  });

export const useSaveSupplier = () =>
  useWrite(
    async (s: Partial<Supplier> & { name: string }) => {
      const { id, ...rest } = s;
      check(
        id
          ? await supabase.from("suppliers").update(rest).eq("id", id)
          : await supabase.from("suppliers").insert(rest),
      );
    },
    ["suppliers"],
  );

export const useSupplierInvoices = (supplierId?: string) =>
  useQuery({
    queryKey: ["supplier-invoices", supplierId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("supplier_invoices")
        .select("*")
        .order("invoice_date", { ascending: false });
      if (supplierId) q = q.eq("supplier_id", supplierId);
      return rows<SupplierInvoice>(await q);
    },
  });

export const useSaveInvoice = () =>
  useWrite(
    async (
      i: Partial<SupplierInvoice> & { supplier_id: string; amount: number },
    ) => {
      const { id, ...rest } = i;
      check(
        id
          ? await supabase.from("supplier_invoices").update(rest).eq("id", id)
          : await supabase.from("supplier_invoices").insert(rest),
      );
    },
    ["supplier-invoices", "finance"],
  );

export const useDeleteInvoice = () =>
  useWrite(
    async (id: string) => {
      check(await supabase.from("supplier_invoices").delete().eq("id", id));
    },
    ["supplier-invoices", "finance"],
  );

/* ───────── inventory ───────── */
export const useMaterials = (projectId?: string) =>
  useQuery({
    queryKey: ["materials", projectId],
    enabled: !!projectId,
    queryFn: async () =>
      rows<MaterialStock>(
        await supabase
          .from("material_stock")
          .select("*")
          .eq("project_id", projectId!)
          .order("name"),
      ),
  });

export const useAddMaterial = () =>
  useWrite(
    async (m: {
      project_id: string;
      name: string;
      unit: string;
      min_qty: number;
    }) => {
      check(await supabase.from("materials").insert(m));
    },
    ["materials"],
  );

export const useStockMoves = (materialId?: string) =>
  useQuery({
    queryKey: ["stock-moves", materialId],
    enabled: !!materialId,
    queryFn: async () =>
      rows<StockMove>(
        await supabase
          .from("stock_moves")
          .select("*")
          .eq("material_id", materialId!)
          .order("created_at", { ascending: false })
          .limit(50),
      ),
  });

export const useAddMove = () =>
  useWrite(
    async (m: {
      material_id: string;
      kind: "in" | "out" | "waste";
      qty: number;
      note: string | null;
    }) => {
      check(await supabase.from("stock_moves").insert(m));
    },
    ["materials", "stock-moves"],
  );

/* ───────── finance ───────── */
export const useFinance = () =>
  useQuery({
    queryKey: ["finance"],
    queryFn: async () => {
      const r = await supabase.rpc("finance_summary");
      return rows<FinanceRow>(r).map((x) => ({
        ...x,
        budget: Number(x.budget),
        spent: Number(x.spent),
        pending: Number(x.pending),
        client_total: Number(x.client_total),
        client_paid: Number(x.client_paid),
        supplier_due: Number(x.supplier_due),
      }));
    },
  });

/* ───────── client contact ───────── */
export const useClientContact = (projectId?: string) =>
  useQuery({
    queryKey: ["client-contact", projectId],
    enabled: !!projectId,
    queryFn: async () =>
      rows<{ full_name: string; phone: string }>(
        await supabase.rpc("client_contact", { p_project: projectId! }),
      )[0] ?? null,
  });

/* ───────── WhatsApp group of the project ───────── */
export const GROUP_RE =
  /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]{10,60}\/?(\?.*)?$/;
/** The two WhatsApp groups of a project: work follow-up, and finance (payments). */
export type GroupKind = "work" | "finance";
const RPC: Record<GroupKind, string> = {
  work: "client_group_link",
  finance: "client_finance_group_link",
};
const COL: Record<
  GroupKind,
  "whatsapp_group_url" | "whatsapp_finance_group_url"
> = { work: "whatsapp_group_url", finance: "whatsapp_finance_group_url" };

/** Client side: the group link of a project they belong to (null when none is set). */
export const useClientGroupLink = (
  projectId?: string,
  kind: GroupKind = "work",
) =>
  useQuery({
    queryKey: ["client-group-link", projectId, kind],
    enabled: !!projectId,
    queryFn: async () => {
      const r = await supabase.rpc(RPC[kind], { p_project: projectId! });
      if (r.error) throw r.error;
      return (r.data as string | null) ?? null;
    },
  });
/** Manager side: read + set the links directly on the project (RLS lets only admin/PM update). */
export const useProjectGroupLink = (
  projectId: string,
  kind: GroupKind = "work",
) =>
  useQuery({
    queryKey: ["project-group-link", projectId, kind],
    queryFn: async () => {
      const r = await supabase
        .from("projects")
        .select(COL[kind])
        .eq("id", projectId)
        .single();
      if (r.error) throw r.error;
      return (
        (r.data as unknown as Record<string, string | null>)[COL[kind]] ?? null
      );
    },
  });
export const useSetGroupLink = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      url,
      kind = "work",
    }: {
      projectId: string;
      url: string | null;
      kind?: GroupKind;
    }) => {
      const r = await supabase
        .from("projects")
        .update({ [COL[kind]]: url })
        .eq("id", projectId);
      if (r.error) throw r.error;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({
        queryKey: ["project-group-link", v.projectId],
      });
      void qc.invalidateQueries({
        queryKey: ["client-group-link", v.projectId],
      });
    },
  });
};

/* ───────── backup: every table the admin can read, as one JSON file ───────── */
const BACKUP_TABLES = [
  "profiles",
  "projects",
  "project_clients",
  "attendance",
  "daily_reports",
  "custody_wallets",
  "expenses",
  "payroll_records",
  "project_stage_history",
  "client_updates",
  "project_payments",
  "client_requests",
  "client_request_messages",
  "stage_ratings",
  "stage_approvals",
  "project_milestones",
  "suppliers",
  "supplier_invoices",
  "materials",
  "stock_moves",
] as const;

export async function downloadBackup(onProgress?: (t: string) => void) {
  const out: Record<string, unknown[]> = {};
  for (const t of BACKUP_TABLES) {
    onProgress?.(t);
    const all: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from(t)
        .select("*")
        .range(from, from + 999);
      if (error) throw new Error(`${t}: ${error.message}`);
      all.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    out[t] = all;
  }
  const blob = new Blob(
    [
      JSON.stringify(
        { exported_at: new Date().toISOString(), tables: out },
        null,
        1,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `backup-${new Date().toISOString().slice(0, 10)}.json`,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
