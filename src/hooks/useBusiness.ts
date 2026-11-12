import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ExpenseCategory } from "@/lib/types";

/* ───────── types (migration 013) ───────── */
export interface BoqItem {
  id: string;
  project_id: string;
  category: ExpenseCategory;
  title: string;
  unit: string;
  qty: number;
  unit_price: number;
  done_qty: number;
}
export interface BoqSummaryRow {
  cat: ExpenseCategory;
  planned: number;
  executed: number;
  actual: number;
}
export interface Quote {
  id: string;
  kind: "quote" | "invoice";
  number: string;
  project_id: string | null;
  client_name: string;
  client_phone: string | null;
  issue_date: string;
  valid_until: string | null;
  discount: number;
  tax_pct: number;
  notes: string | null;
  status: "draft" | "sent" | "accepted" | "rejected" | "paid";
  created_at: string;
}
export interface QuoteItem {
  id: string;
  quote_id: string;
  description: string;
  unit: string;
  qty: number;
  unit_price: number;
  sort: number;
}
export interface ChangeOrder {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  cost_delta: number;
  days_delta: number;
  status: "pending" | "approved" | "rejected";
  client_note: string | null;
  decided_at: string | null;
  created_at: string;
}
export interface Subcontract {
  id: string;
  project_id: string;
  name: string;
  trade: string | null;
  phone: string | null;
  agreed_amount: number;
  notes: string | null;
}
export interface SubcontractPayment {
  id: string;
  subcontract_id: string;
  amount: number;
  paid_on: string;
  note: string | null;
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
function useWrite<A, R = void>(fn: (a: A) => Promise<R>, keys: string[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      keys.forEach((k) => void qc.invalidateQueries({ queryKey: [k] })),
  });
}
const n = (v: unknown) => Number(v ?? 0);

/* ───────── BOQ ───────── */
export const useBoq = (projectId?: string) =>
  useQuery({
    queryKey: ["boq", projectId],
    enabled: !!projectId,
    queryFn: async () =>
      rows<BoqItem>(
        await supabase
          .from("boq_items")
          .select("*")
          .eq("project_id", projectId!)
          .order("category")
          .order("created_at"),
      ).map((x) => ({
        ...x,
        qty: n(x.qty),
        unit_price: n(x.unit_price),
        done_qty: n(x.done_qty),
      })),
  });
export const useBoqSummary = (projectId?: string) =>
  useQuery({
    queryKey: ["boq-summary", projectId],
    enabled: !!projectId,
    queryFn: async () =>
      rows<BoqSummaryRow>(
        await supabase.rpc("boq_summary", { p_project: projectId! }),
      ).map((x) => ({
        ...x,
        planned: n(x.planned),
        executed: n(x.executed),
        actual: n(x.actual),
      })),
  });
export const useSaveBoq = () =>
  useWrite(
    async (b: Partial<BoqItem> & { project_id: string }) => {
      const { id, ...rest } = b;
      check(
        id
          ? await supabase.from("boq_items").update(rest).eq("id", id)
          : await supabase.from("boq_items").insert(rest),
      );
    },
    ["boq", "boq-summary"],
  );
export const useDeleteBoq = () =>
  useWrite(
    async (id: string) => {
      check(await supabase.from("boq_items").delete().eq("id", id));
    },
    ["boq", "boq-summary"],
  );

/* ───────── quotes & invoices ───────── */
export const useQuotes = () =>
  useQuery({
    queryKey: ["quotes"],
    queryFn: async () =>
      rows<Quote>(
        await supabase
          .from("quotes")
          .select("*")
          .order("created_at", { ascending: false }),
      ).map((q) => ({ ...q, discount: n(q.discount), tax_pct: n(q.tax_pct) })),
  });
export const useQuote = (id?: string) =>
  useQuery({
    queryKey: ["quote", id],
    enabled: !!id,
    queryFn: async () => {
      const q = await supabase
        .from("quotes")
        .select("*")
        .eq("id", id!)
        .single();
      if (q.error) throw new Error(q.error.message);
      const it = rows<QuoteItem>(
        await supabase
          .from("quote_items")
          .select("*")
          .eq("quote_id", id!)
          .order("sort")
          .order("id"),
      ).map((x) => ({ ...x, qty: n(x.qty), unit_price: n(x.unit_price) }));
      const quote = q.data as Quote;
      return {
        quote: {
          ...quote,
          discount: n(quote.discount),
          tax_pct: n(quote.tax_pct),
        },
        items: it,
      };
    },
  });
export const useCreateQuote = () =>
  useWrite(
    async (a: {
      quote: Partial<Quote> & { client_name: string };
      items?: Omit<QuoteItem, "id" | "quote_id" | "sort">[];
    }) => {
      const r = await supabase
        .from("quotes")
        .insert(a.quote)
        .select("id")
        .single();
      if (r.error) throw new Error(r.error.message);
      const id = (r.data as { id: string }).id;
      if (a.items?.length)
        check(
          await supabase
            .from("quote_items")
            .insert(a.items.map((x, i) => ({ ...x, quote_id: id, sort: i }))),
        );
      return id;
    },
    ["quotes"],
  );
export const useUpdateQuote = () =>
  useWrite(
    async (a: { id: string; patch: Partial<Quote> }) => {
      check(await supabase.from("quotes").update(a.patch).eq("id", a.id));
    },
    ["quotes", "quote"],
  );
export const useDeleteQuote = () =>
  useWrite(
    async (id: string) => {
      check(await supabase.from("quotes").delete().eq("id", id));
    },
    ["quotes"],
  );
export const useSaveQuoteItem = () =>
  useWrite(
    async (x: Partial<QuoteItem> & { quote_id: string }) => {
      const { id, ...rest } = x;
      check(
        id
          ? await supabase.from("quote_items").update(rest).eq("id", id)
          : await supabase.from("quote_items").insert(rest),
      );
    },
    ["quote"],
  );
export const useDeleteQuoteItem = () =>
  useWrite(
    async (id: string) => {
      check(await supabase.from("quote_items").delete().eq("id", id));
    },
    ["quote"],
  );

/** Totals shared by the editor and the print view. */
export function quoteTotals(
  items: { qty: number; unit_price: number }[],
  discount: number,
  taxPct: number,
) {
  const sub = items.reduce((s, x) => s + x.qty * x.unit_price, 0);
  const afterDiscount = Math.max(0, sub - discount);
  const tax = Math.round(afterDiscount * taxPct) / 100;
  return { sub, afterDiscount, tax, total: afterDiscount + tax };
}

/* ───────── change orders ───────── */
export const useChangeOrders = (projectId?: string) =>
  useQuery({
    queryKey: ["change-orders", projectId],
    enabled: !!projectId,
    queryFn: async () =>
      rows<ChangeOrder>(
        await supabase
          .from("change_orders")
          .select("*")
          .eq("project_id", projectId!)
          .order("created_at", { ascending: false }),
      ).map((c) => ({
        ...c,
        cost_delta: n(c.cost_delta),
        days_delta: n(c.days_delta),
      })),
  });
export const useSaveChangeOrder = () =>
  useWrite(
    async (c: {
      project_id: string;
      title: string;
      description: string | null;
      cost_delta: number;
      days_delta: number;
    }) => {
      check(await supabase.from("change_orders").insert(c));
    },
    ["change-orders"],
  );
export const useDeleteChangeOrder = () =>
  useWrite(
    async (id: string) => {
      check(await supabase.from("change_orders").delete().eq("id", id));
    },
    ["change-orders"],
  );
export const useDecideChangeOrder = () =>
  useWrite(
    async (a: { id: string; approve: boolean; note: string }) => {
      check(
        await supabase.rpc("decide_change_order", {
          p_id: a.id,
          p_approve: a.approve,
          p_note: a.note || null,
        }),
      );
    },
    ["change-orders"],
  );

/* ───────── subcontractors ───────── */
export const useSubcontracts = (projectId?: string) =>
  useQuery({
    queryKey: ["subcontracts", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const s = rows<Subcontract>(
        await supabase
          .from("subcontracts")
          .select("*")
          .eq("project_id", projectId!)
          .order("created_at"),
      ).map((x) => ({ ...x, agreed_amount: n(x.agreed_amount) }));
      const ids = s.map((x) => x.id);
      const p = ids.length
        ? rows<SubcontractPayment>(
            await supabase
              .from("subcontract_payments")
              .select("*")
              .in("subcontract_id", ids)
              .order("paid_on", { ascending: false }),
          ).map((x) => ({ ...x, amount: n(x.amount) }))
        : [];
      return s.map((x) => ({
        ...x,
        payments: p.filter((y) => y.subcontract_id === x.id),
      }));
    },
  });
export const useSaveSubcontract = () =>
  useWrite(
    async (
      s: Partial<Subcontract> & {
        project_id: string;
        name: string;
        agreed_amount: number;
      },
    ) => {
      const { id, ...rest } = s;
      check(
        id
          ? await supabase.from("subcontracts").update(rest).eq("id", id)
          : await supabase.from("subcontracts").insert(rest),
      );
    },
    ["subcontracts"],
  );
export const useDeleteSubcontract = () =>
  useWrite(
    async (id: string) => {
      check(await supabase.from("subcontracts").delete().eq("id", id));
    },
    ["subcontracts"],
  );
export const useAddSubPayment = () =>
  useWrite(
    async (p: {
      subcontract_id: string;
      amount: number;
      note: string | null;
    }) => {
      check(await supabase.from("subcontract_payments").insert(p));
    },
    ["subcontracts"],
  );
export const useDeleteSubPayment = () =>
  useWrite(
    async (id: string) => {
      check(await supabase.from("subcontract_payments").delete().eq("id", id));
    },
    ["subcontracts"],
  );
