import { useState } from "react";
import { Download, Eye, EyeOff, FileText, Plus, Trash2 } from "lucide-react";
import {
  useAddDocument,
  useDeleteDocument,
  useDocuments,
  useSignedUrl,
  useToggleDocumentVisibility,
  type ProjectDocument,
} from "@/hooks/useDocuments";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  useToast,
} from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { downloadStorageFile } from "@/lib/imageUtils";

const isImage = (p: string) => /\.(jpe?g|png|webp)$/i.test(p);
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx";

const extOf = (p: string) => p.split(".").pop()?.toLowerCase() ?? "jpg";

/** Before / after pair, or a single file. Images open in a lightbox and can be downloaded. Shared by the manager panel and the client card. */
export function DocumentView({ d }: { d: ProjectDocument }) {
  const toast = useToast();
  const a = useSignedUrl(d.file_path);
  const b = useSignedUrl(d.file_path_after);
  const [open, setOpen] = useState<{
    url: string;
    path: string;
    name: string;
  } | null>(null);
  const save = (path: string, name: string) =>
    downloadStorageFile("project-docs", path, name).catch((e) =>
      toast((e as Error).message, "bad"),
    );

  if (d.kind === "before_after") {
    const items = [
      { label: "قبل", url: a, path: d.file_path },
      { label: "بعد", url: b, path: d.file_path_after as string },
    ];
    return (
      <>
        <div className="grid grid-cols-2 gap-2">
          {items.map(({ label, url, path }) => (
            <figure
              key={label}
              className="relative overflow-hidden rounded-lg border border-line bg-raised"
            >
              {url ? (
                <button
                  type="button"
                  onClick={() =>
                    setOpen({
                      url,
                      path,
                      name: `${d.title}-${label}.${extOf(path)}`,
                    })
                  }
                  className="block w-full"
                  aria-label={`تكبير صورة ${label}`}
                >
                  <img
                    src={url}
                    alt={`${d.title} - ${label}`}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover"
                  />
                </button>
              ) : (
                <div className="aspect-[4/3]" />
              )}
              <figcaption className="pointer-events-none absolute start-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white">
                {label}
              </figcaption>
              {url && (
                <button
                  type="button"
                  onClick={() =>
                    void save(path, `${d.title}-${label}.${extOf(path)}`)
                  }
                  aria-label={`تنزيل صورة ${label}`}
                  className="absolute bottom-2 end-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
                >
                  <Download className="h-4 w-4" />
                </button>
              )}
            </figure>
          ))}
        </div>
        <Lightbox
          open={open}
          onClose={() => setOpen(null)}
          onSave={(o) => void save(o.path, o.name)}
        />
      </>
    );
  }
  if (!a) return <span className="text-xs text-muted">...</span>;
  const name = `${d.title}.${extOf(d.file_path)}`;
  return isImage(d.file_path) ? (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <button
          type="button"
          onClick={() => setOpen({ url: a, path: d.file_path, name })}
          aria-label="تكبير الصورة"
        >
          <img
            src={a}
            alt={d.title}
            loading="lazy"
            className="max-h-56 rounded-lg border border-line"
          />
        </button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void save(d.file_path, name)}
        >
          <Download className="h-3.5 w-3.5" /> تنزيل
        </Button>
      </div>
      <Lightbox
        open={open}
        onClose={() => setOpen(null)}
        onSave={(o) => void save(o.path, o.name)}
      />
    </>
  ) : (
    <div className="flex flex-wrap items-center gap-3">
      <a
        href={a}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-sm font-bold text-brand"
      >
        <FileText className="h-4 w-4" /> فتح الملف
      </a>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => void save(d.file_path, name)}
      >
        <Download className="h-3.5 w-3.5" /> تنزيل
      </Button>
    </div>
  );
}

function Lightbox({
  open,
  onClose,
  onSave,
}: {
  open: { url: string; path: string; name: string } | null;
  onClose: () => void;
  onSave: (o: { url: string; path: string; name: string }) => void;
}) {
  return (
    <Modal
      open={!!open}
      onClose={onClose}
      title="عرض الصورة"
      footer={
        <Button onClick={() => open && onSave(open)}>
          <Download className="h-4 w-4" /> تنزيل الصورة
        </Button>
      }
    >
      {open && (
        <img
          src={open.url}
          alt="صورة"
          className="mx-auto max-h-[70vh] rounded-lg"
        />
      )}
    </Modal>
  );
}

export function DocumentsPanel({ projectId }: { projectId: string }) {
  const toast = useToast();
  const q = useDocuments(projectId);
  const add = useAddDocument();
  const del = useDeleteDocument();
  const vis = useToggleDocumentVisibility();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"document" | "before_after">("document");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [after, setAfter] = useState<File | null>(null);
  const [visible, setVisible] = useState(true);

  const reset = () => {
    setTitle("");
    setFile(null);
    setAfter(null);
    setKind("document");
    setVisible(true);
  };
  const ready = title.trim() && file && (kind === "document" || after);

  const save = () =>
    add.mutate(
      {
        projectId,
        kind,
        title: title.trim(),
        file: file!,
        fileAfter: after ?? undefined,
        visible,
      },
      {
        onSuccess: () => {
          toast("تم الرفع");
          setOpen(false);
          reset();
        },
        onError: (e) => toast((e as Error).message, "bad"),
      },
    );

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-extrabold">مستندات المشروع وصور قبل/بعد</h3>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> رفع
        </Button>
      </div>
      {q.isLoading ? (
        <Spinner />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : !q.data?.length ? (
        <Empty>لا توجد مستندات بعد.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {q.data.map((d) => (
            <li key={d.id} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <b className="text-sm">{d.title}</b>{" "}
                  <span className="text-xs text-muted">
                    · {fmtDate(d.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge tone={d.kind === "before_after" ? "info" : "gray"}>
                    {d.kind === "before_after" ? "قبل / بعد" : "مستند"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      vis.mutate(
                        { id: d.id, visible: !d.visible_to_client },
                        { onError: (e) => toast((e as Error).message, "bad") },
                      )
                    }
                    aria-label={
                      d.visible_to_client ? "إخفاء عن العميل" : "إظهار للعميل"
                    }
                  >
                    {d.visible_to_client ? (
                      <>
                        <Eye className="h-3.5 w-3.5" /> ظاهر للعميل
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-3.5 w-3.5" /> مخفي
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    aria-label="حذف"
                    loading={del.isPending && del.variables?.id === d.id}
                    onClick={() => {
                      if (confirm("حذف هذا الملف نهائياً؟"))
                        del.mutate(d, {
                          onError: (e) => toast((e as Error).message, "bad"),
                        });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <DocumentView d={d} />
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="رفع ملف"
        footer={
          <Button loading={add.isPending} disabled={!ready} onClick={save}>
            رفع
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="النوع">
            <Select
              value={kind}
              onChange={(e) =>
                setKind(e.target.value as "document" | "before_after")
              }
            >
              <option value="document">مستند (عقد، مخطط، فاتورة...)</option>
              <option value="before_after">صورتان: قبل وبعد</option>
            </Select>
          </Field>
          <Field label="العنوان">
            <Input
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                kind === "document" ? "مثال: عقد الاتفاق" : "مثال: ركن المعيشة"
              }
            />
          </Field>
          <Field
            label={kind === "document" ? "الملف (حتى 10 ميجا)" : "صورة «قبل»"}
          >
            <input
              type="file"
              accept={kind === "document" ? ACCEPT : "image/*"}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          {kind === "before_after" && (
            <Field label="صورة «بعد»">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setAfter(e.target.files?.[0] ?? null)}
              />
            </Field>
          )}
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={visible}
              onChange={(e) => setVisible(e.target.checked)}
            />{" "}
            إظهاره للعميل
          </label>
        </div>
      </Modal>
    </Card>
  );
}

/** Client side: read-only (RLS only returns files marked visible for the client's own projects). */
export function ClientDocumentsCard({ projectId }: { projectId: string }) {
  const q = useDocuments(projectId);
  if (!q.data?.length) return null;
  const pairs = q.data.filter((d) => d.kind === "before_after");
  const docs = q.data.filter((d) => d.kind === "document");
  return (
    <>
      {!!pairs.length && (
        <Card className="p-5">
          <h2 className="mb-3 font-extrabold">قبل وبعد</h2>
          <div className="flex flex-col gap-4">
            {pairs.map((d) => (
              <div key={d.id}>
                <div className="mb-1.5 text-sm font-bold">{d.title}</div>
                <DocumentView d={d} />
              </div>
            ))}
          </div>
        </Card>
      )}
      {!!docs.length && (
        <Card className="p-5">
          <h2 className="mb-3 font-extrabold">مستندات المشروع</h2>
          <ul className="divide-y divide-line">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-col gap-1.5 py-3">
                <div className="text-sm font-bold">
                  {d.title}{" "}
                  <span className="text-xs font-normal text-muted">
                    · {fmtDate(d.created_at)}
                  </span>
                </div>
                <DocumentView d={d} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
