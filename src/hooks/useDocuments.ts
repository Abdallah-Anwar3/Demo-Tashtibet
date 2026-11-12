import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface ProjectDocument {
  id: string;
  project_id: string;
  kind: "document" | "before_after";
  title: string;
  file_path: string;
  file_path_after: string | null;
  visible_to_client: boolean;
  created_at: string;
}

const BUCKET = "project-docs";
export const MAX_DOC_BYTES = 10 * 1024 * 1024;

export const useDocuments = (projectId?: string) =>
  useQuery({
    queryKey: ["documents", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_documents")
        .select("*")
        .eq("project_id", projectId!)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ProjectDocument[];
    },
  });

/** Storage keys must be plain ASCII: keep the extension, drop the rest of the (often Arabic) file name. */
async function upload(projectId: string, file: File): Promise<string> {
  if (file.size > MAX_DOC_BYTES)
    throw new Error("حجم الملف أكبر من 10 ميجابايت");
  const ext =
    (file.name.split(".").pop() ?? "bin")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 5) || "bin";
  const path = `${projectId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  return path;
}

export const useAddDocument = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: {
      projectId: string;
      kind: "document" | "before_after";
      title: string;
      file: File;
      fileAfter?: File;
      visible: boolean;
    }) => {
      const uploaded: string[] = [];
      try {
        const p1 = await upload(a.projectId, a.file);
        uploaded.push(p1);
        let p2: string | null = null;
        if (a.kind === "before_after") {
          if (!a.fileAfter) throw new Error("اختر صورة «بعد»");
          p2 = await upload(a.projectId, a.fileAfter);
          uploaded.push(p2);
        }
        const { error } = await supabase.from("project_documents").insert({
          project_id: a.projectId,
          kind: a.kind,
          title: a.title,
          file_path: p1,
          file_path_after: p2,
          visible_to_client: a.visible,
        });
        if (error) throw new Error(error.message);
      } catch (e) {
        if (uploaded.length)
          await supabase.storage.from(BUCKET).remove(uploaded); // no orphan files
        throw e;
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["documents"] }),
  });
};

export const useDeleteDocument = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: ProjectDocument) => {
      const { error } = await supabase
        .from("project_documents")
        .delete()
        .eq("id", d.id);
      if (error) throw new Error(error.message);
      await supabase.storage
        .from(BUCKET)
        .remove([
          d.file_path,
          ...(d.file_path_after ? [d.file_path_after] : []),
        ]);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["documents"] }),
  });
};

export const useToggleDocumentVisibility = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; visible: boolean }) => {
      const { error } = await supabase
        .from("project_documents")
        .update({ visible_to_client: a.visible })
        .eq("id", a.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["documents"] }),
  });
};

/** Short-lived signed URL for one private file. */
export function useSignedUrl(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (path)
      void supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 3600)
        .then(({ data }) => {
          if (live) setUrl(data?.signedUrl ?? null);
        });
    return () => {
      live = false;
    };
  }, [path]);
  return url;
}
