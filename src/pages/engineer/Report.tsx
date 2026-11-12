import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Camera, Send, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useProjects } from "@/hooks/useData";
import { localDB } from "@/lib/db";
import { compressImage } from "@/lib/imageUtils";
import { todayISO } from "@/lib/format";
import { newId } from "@/lib/utils";
import {
  Button,
  Card,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";

export default function EngReport() {
  const { profile } = useAuth();
  const toast = useToast();
  const { sync, online } = useOfflineSync();
  const projects = useProjects();
  const [projectId, setProjectId] = useState("");
  const [f, setF] = useState({
    completed: "",
    remaining: "",
    issues: "",
    notes: "",
  });
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [busy, setBusy] = useState(false);

  const active = projects.data?.filter((p) => p.status === "active") ?? [];
  useEffect(() => {
    if (!projectId && active[0]) setProjectId(active[0].id);
  }, [active, projectId]);

  const previews = useMemo(
    () => photos.map((b) => URL.createObjectURL(b)),
    [photos],
  );
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews]);

  const addPhotos = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    // compress right away so IndexedDB never stores multi-MB camera originals
    const small = await Promise.all(files.map((x) => compressImage(x)));
    setPhotos((p) => [...p, ...small]);
  };

  const submit = async () => {
    if (!profile || !projectId) return;
    if (!f.completed.trim()) {
      toast("اكتب الأعمال المنفذة اليوم", "bad");
      return;
    }
    setBusy(true);
    try {
      // Always saved locally first, then pushed: the same path works online and offline.
      await localDB.pendingReports.add({
        offlineId: newId(),
        projectId,
        engineerId: profile.id,
        completedWork: f.completed.trim(),
        remainingWork: f.remaining.trim(),
        issues: f.issues.trim(),
        notes: f.notes.trim(),
        photos,
        date: todayISO(),
        syncStatus: "pending",
        createdAt: new Date().toISOString(),
      });
      setF({ completed: "", remaining: "", issues: "", notes: "" });
      setPhotos([]);
      toast(
        online
          ? "تم حفظ التقرير وجارٍ رفعه"
          : "تم الحفظ على الجهاز وسيُرفع عند عودة الإنترنت",
      );
      void sync();
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      {!online && (
        <div className="rounded-lg bg-bad-soft p-3 text-sm font-semibold text-bad">
          أنت غير متصل. سيُحفظ التقرير على جهازك ويُرسل تلقائياً عند عودة
          الاتصال.
        </div>
      )}
      <Card className="flex flex-col gap-4 p-4">
        <Field label="الموقع *">
          <Select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {active.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="بنود الأعمال المنفذة اليوم *">
          <Textarea
            value={f.completed}
            onChange={(e) => setF({ ...f, completed: e.target.value })}
            placeholder="مثال: تركيب سيراميك أرضية الصالون 85 م²"
          />
        </Field>
        <Field label="المتبقي لإنهاء المرحلة">
          <Textarea
            value={f.remaining}
            onChange={(e) => setF({ ...f, remaining: e.target.value })}
          />
        </Field>
        <Field label="المشاكل والمعوقات">
          <Textarea
            value={f.issues}
            onChange={(e) => setF({ ...f, issues: e.target.value })}
            className="min-h-[64px]"
          />
        </Field>
        <Field label="ملاحظات هندسية">
          <Textarea
            value={f.notes}
            onChange={(e) => setF({ ...f, notes: e.target.value })}
            className="min-h-[64px]"
          />
        </Field>

        <div>
          <div className="mb-2 text-xs font-bold text-muted">
            التوثيق البصري
          </div>
          <div className="flex flex-wrap gap-2">
            {previews.map((src, i) => (
              <div key={src} className="relative">
                <img
                  src={src}
                  alt={`صورة ${i + 1}`}
                  className="h-[72px] w-[72px] rounded-lg border border-line object-cover"
                />
                <button
                  type="button"
                  aria-label="حذف الصورة"
                  onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                  className="absolute -end-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-bad text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <label className="grid h-[72px] w-[72px] cursor-pointer place-items-center rounded-lg border-2 border-dashed border-line text-muted hover:border-brand hover:text-brand">
              <span className="flex flex-col items-center gap-0.5 text-[10px] font-bold">
                <Camera className="h-5 w-5" />
                إضافة صورة
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="sr-only"
                onChange={addPhotos}
              />
            </label>
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            تُضغط الصور تلقائياً إلى أقل من 350 كيلوبايت.
          </p>
        </div>
      </Card>
      <Button size="lg" loading={busy} onClick={submit}>
        <Send className="h-5 w-5" /> إرسال التقرير
      </Button>
    </div>
  );
}
