import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ProjectStage } from "@/lib/types";

export interface StageApproval {
  id: string;
  project_id: string;
  stage: ProjectStage;
  client_id: string;
  decision: "approved" | "changes";
  comment: string | null;
  created_at: string;
}

/** Newest first. A client sees only their own rows; managers see all (RLS). */
export const useApprovals = (projectId?: string) =>
  useQuery({
    queryKey: ["approvals", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_approvals")
        .select("*")
        .eq("project_id", projectId!)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as StageApproval[];
    },
  });

export const useDecideStage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: {
      project_id: string;
      stage: ProjectStage;
      client_id: string;
      decision: "approved" | "changes";
      comment: string | null;
    }) => {
      const { error } = await supabase.from("stage_approvals").insert(a);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["approvals"] });
      void qc.invalidateQueries({ queryKey: ["requests"] });
    },
  });
};
