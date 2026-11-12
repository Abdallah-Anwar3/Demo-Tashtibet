import imageCompression from "browser-image-compression";
import { supabase } from "./supabase";
import { newId } from "./utils";

export type Bucket = "site-reports" | "receipts" | "project-docs";

const OPTIONS = {
  maxSizeMB: 0.34, // a little under 350 KB so metadata never tips it over
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  fileType: "image/jpeg",
  initialQuality: 0.82,
};

/** Compress to roughly <= 350 KB. PDFs and failures return the original. */
export async function compressImage(file: File | Blob): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const f =
      file instanceof File
        ? file
        : new File([file], "photo.jpg", { type: file.type });
    return await imageCompression(f, OPTIONS);
  } catch (err) {
    console.warn("[image] compression failed, using original", err);
    return file;
  }
}

/**
 * Compress and upload. Buckets are PRIVATE, so we return storage *paths*
 * (saved in the DB) and turn them into short-lived signed URLs when displaying.
 * `prefix` must start with the user's id: storage RLS checks the first folder.
 */
export async function uploadImages(
  files: (File | Blob)[],
  prefix: string,
  bucket: Bucket,
): Promise<string[]> {
  const paths: string[] = [];
  for (const file of files) {
    const body = await compressImage(file);
    const isPdf = body.type === "application/pdf";
    const path = `${prefix}/${newId()}.${isPdf ? "pdf" : "jpg"}`;
    const { error } = await supabase.storage.from(bucket).upload(path, body, {
      contentType: isPdf ? "application/pdf" : "image/jpeg",
      upsert: false,
    });
    if (error) throw new Error(`فشل رفع الصورة: ${error.message}`);
    paths.push(path);
  }
  return paths;
}

export async function signedUrls(
  bucket: Bucket,
  paths: string[],
  expiresIn = 3600,
): Promise<string[]> {
  if (!paths.length) return [];
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, expiresIn);
  if (error || !data) return [];
  return data.map((d) => d.signedUrl ?? "").filter(Boolean);
}

/**
 * Download a private file. The signed URL carries a Content-Disposition: attachment
 * header, so the browser saves it instead of opening it (works cross-origin, unlike
 * the HTML `download` attribute).
 */
export async function downloadStorageFile(
  bucket: Bucket,
  path: string,
  filename?: string,
) {
  const name = filename ?? path.split("/").pop() ?? "file";
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 120, { download: name });
  if (error || !data) throw new Error("تعذّر تجهيز الملف للتنزيل");
  const a = Object.assign(document.createElement("a"), {
    href: data.signedUrl,
    rel: "noopener",
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const fileToDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
