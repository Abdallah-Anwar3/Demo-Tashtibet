import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useApprovals, useDecideStage } from "@/hooks/useApprovals";
import { Badge, Button, Card, Textarea, useToast } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { STAGES, STAGE_LABEL } from "@/lib/labels";
import type { ClientProject, ProjectStage } from "@/lib/types";

type Mode = { stage: ProjectStage; kind: "approve" | "changes" } | null;

/** The client approves each FINISHED stage or asks for changes. Records are permanent (database-enforced). */
export function StageApprovalCard({ project }: { project: ClientProject }) {
  const { profile } = useAuth();
  const toast = useToast();
  const approvals = useApprovals(project.id);
  const decide = useDecideStage();
  const [mode, setMode] = useState<Mode>(null);
  const [comment, setComment] = useState("");

  const idx = STAGES.indexOf(project.stage);
  const finished = [
    ...STAGES.slice(0, idx),
    ...(project.status === "completed" ? [project.stage] : []),
  ];
  if (!finished.length || !profile) return null;

  const latest = (s: ProjectStage) =>
    approvals.data?.find((a) => a.stage === s && a.client_id === profile.id);
  const waiting = finished.filter(
    (s) => latest(s)?.decision !== "approved",
  ).length;

  const send = (stage: ProjectStage, decision: "approved" | "changes") => {
    decide.mutate(
      {
        project_id: project.id,
        stage,
        client_id: profile.id,
        decision,
        comment: decision === "changes" ? comment.trim() : null,
      },
      {
        onSuccess: () => {
          toast(
            decision === "approved"
              ? "تم اعتماد المرحلة"
              : "تم إرسال طلب التعديل للإدارة",
          );
          setMode(null);
          setComment("");
        },
        onError: (e) => toast((e as Error).message, "bad"),
      },
    );
  };

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-extrabold">اعتماد المراحل المنتهية</h2>
        {waiting > 0 && <Badge tone="brand">{waiting} بانتظار قرارك</Badge>}
      </div>
      <ul className="divide-y divide-line">
        {finished.map((s) => {
          const a = latest(s);
          const open = mode?.stage === s;
          return (
            <li key={s} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">{STAGE_LABEL[s]}</span>
                {a?.decision === "approved" ? (
                  <Badge tone="ok">معتمدة · {fmtDate(a.created_at)}</Badge>
                ) : a?.decision === "changes" ? (
                  <Badge tone="warn">طلبت تعديلات</Badge>
                ) : (
                  <Badge tone="gray">بانتظار اعتمادك</Badge>
                )}
              </div>
              {a?.decision === "changes" && a.comment && (
                <p className="mt-1 text-xs text-muted">ملاحظتك: {a.comment}</p>
              )}

              {a?.decision !== "approved" && !open && (
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setMode({ stage: s, kind: "approve" });
                      setComment("");
                    }}
                  >
                    <Check className="h-4 w-4" /> اعتماد
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setMode({ stage: s, kind: "changes" });
                      setComment("");
                    }}
                  >
                    <Pencil className="h-4 w-4" /> طلب تعديل
                  </Button>
                </div>
              )}

              {open && mode?.kind === "approve" && (
                <div className="mt-3 rounded-lg bg-raised p-3 text-sm">
                  <p className="mb-2 font-bold">
                    تأكيد اعتماد مرحلة «{STAGE_LABEL[s]}»؟ لا يمكن التراجع بعد
                    التأكيد.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      loading={decide.isPending}
                      onClick={() => send(s, "approved")}
                    >
                      نعم، أعتمد
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setMode(null)}
                    >
                      إلغاء
                    </Button>
                  </div>
                </div>
              )}
              {open && mode?.kind === "changes" && (
                <div className="mt-3 flex flex-col gap-3">
                  <Textarea
                    value={comment}
                    maxLength={2000}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="ما المطلوب تعديله؟ (إلزامي)"
                    className="min-h-[72px]"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      loading={decide.isPending}
                      disabled={!comment.trim()}
                      onClick={() => send(s, "changes")}
                    >
                      إرسال الطلب
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setMode(null)}
                    >
                      إلغاء
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] text-muted">
        طلب التعديل يظهر لدى الإدارة ضمن «طلباتك» ويمكنك متابعة الرد عليه.
      </p>
    </Card>
  );
}
