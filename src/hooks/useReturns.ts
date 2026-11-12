import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { uploadImages } from "@/lib/imageUtils";
import type { ExpenseStatus } from "@/lib/types";

/** Money coming back to an engineer's custody (مرتجع العهدة). */
export interface CustodyReturn {
  id: string;
  custody_id: string;
  engineer_id: string;
  project_id: string | null;
  amount: number;
  description: string | null;
  /** Storage path inside the private `receipts` bucket. */
  receipt_url: string | null;
  status: ExpenseStatus;
  created_at: string;
}

const REFRESH = ["returns", "wallets", "wallet", "notifications"];

export const useReturns = (
  opts: { engineerId?: string; limit?: number } = {},
) =>
  useQuery({
    queryKey: ["returns", opts],
    queryFn: async () => {
      let q = supabase
        .from("custody_returns")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(opts.limit ?? 200);
      if (opts.engineerId) q = q.eq("engineer_id", opts.engineerId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as CustodyReturn[];
    },
  });

/** Online only: the receipt photo is uploaded first, then the row is inserted (the wallet is credited by a DB trigger). */
export const useAddReturn = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: {
      engineerId: string;
      projectId: string;
      amount: number;
      description: string;
      receipt?: Blob | null;
    }) => {
      const receipt = a.receipt
        ? (
            await uploadImages(
              [a.receipt],
              `${a.engineerId}/ret-${Date.now()}`,
              "receipts",
            )
          )[0]
        : null;
      const { error } = await supabase.from("custody_returns").insert({
        engineer_id: a.engineerId,
        project_id: a.projectId,
        amount: a.amount,
        description: a.description,
        receipt_url: receipt,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () =>
      REFRESH.forEach((k) => void qc.invalidateQueries({ queryKey: [k] })),
  });
};

export const useReviewReturn = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: ExpenseStatus;
    }) => {
      const { error } = await supabase
        .from("custody_returns")
        .update({ status })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () =>
      REFRESH.forEach((k) => void qc.invalidateQueries({ queryKey: [k] })),
  });
};
