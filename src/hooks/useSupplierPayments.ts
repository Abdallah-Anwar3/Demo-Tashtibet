import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface SupplierPayment {
  id: string;
  invoice_id: string;
  amount: number;
  paid_on: string;
  note: string | null;
}

const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};

export const useSupplierPayments = () =>
  useQuery({
    queryKey: ["supplier-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_payments")
        .select("id, invoice_id, amount, paid_on, note")
        .order("paid_on", { ascending: false })
        .order("created_at", { ascending: false });
      fail(error);
      return ((data ?? []) as SupplierPayment[]).map((p) => ({
        ...p,
        amount: Number(p.amount),
      }));
    },
  });

function useRefresh() {
  const qc = useQueryClient();
  return () =>
    ["supplier-payments", "supplier-invoices", "finance"].forEach(
      (k) => void qc.invalidateQueries({ queryKey: [k] }),
    );
}

/** A new invoice, optionally with a first payment already made. */
export const useCreateInvoice = () => {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (a: {
      supplier_id: string;
      amount: number;
      project_id: string | null;
      invoice_date: string;
      note: string | null;
      firstPayment: number;
    }) => {
      const { firstPayment, ...inv } = a;
      const { data, error } = await supabase
        .from("supplier_invoices")
        .insert(inv)
        .select("id")
        .single();
      fail(error);
      if (firstPayment > 0) {
        const r = await supabase
          .from("supplier_payments")
          .insert({
            invoice_id: (data as { id: string }).id,
            amount: firstPayment,
            paid_on: a.invoice_date,
          });
        fail(r.error);
      }
    },
    onSuccess: refresh,
  });
};

/** Adds one instalment. The database refuses anything above what is still due. */
export const useAddPayment = () => {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (a: {
      invoice_id: string;
      amount: number;
      paid_on: string;
      note: string | null;
    }) => {
      fail((await supabase.from("supplier_payments").insert(a)).error);
    },
    onSuccess: refresh,
  });
};

export const useDeletePayment = () => {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (id: string) => {
      fail(
        (await supabase.from("supplier_payments").delete().eq("id", id)).error,
      );
    },
    onSuccess: refresh,
  });
};
