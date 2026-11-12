import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRateStage, useRatings } from "@/hooks/useData";
import { Button, Card, Textarea, useToast } from "@/components/ui";
import { Stars } from "@/components/Stars";
import { STAGES, STAGE_LABEL } from "@/lib/labels";
import type { ClientProject, ProjectStage } from "@/lib/types";

/** Lets the client rate every FINISHED stage once (the database rejects unfinished stages). */
export function StageRatingCard({ project }: { project: ClientProject }) {
  const { profile } = useAuth();
  const toast = useToast();
  const ratings = useRatings(project.id);
  const rate = useRateStage();
  const [stage, setStage] = useState<ProjectStage | null>(null);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");

  const idx = STAGES.indexOf(project.stage);
  const finished = [
    ...STAGES.slice(0, idx),
    ...(project.status === "completed" ? [project.stage] : []),
  ];
  if (!finished.length) return null;
  const mine = (s: ProjectStage) =>
    ratings.data?.find((r) => r.stage === s && r.client_id === profile?.id);

  const submit = () => {
    if (!profile || !stage || !stars) return;
    rate.mutate(
      {
        project_id: project.id,
        stage,
        client_id: profile.id,
        rating: stars,
        comment: comment.trim() || null,
      },
      {
        onSuccess: () => {
          toast("شكراً لتقييمك");
          setStage(null);
          setStars(0);
          setComment("");
        },
        onError: (e) => toast((e as Error).message, "bad"),
      },
    );
  };

  return (
    <Card className="p-5">
      <h2 className="mb-3 font-extrabold">قيّم المراحل المنتهية</h2>
      <ul className="divide-y divide-line">
        {finished.map((s) => {
          const r = mine(s);
          return (
            <li key={s} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold">{STAGE_LABEL[s]}</span>
                {r ? (
                  <Stars value={r.rating} size="sm" />
                ) : stage === s ? null : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setStage(s);
                      setStars(0);
                      setComment("");
                    }}
                  >
                    قيّم
                  </Button>
                )}
              </div>
              {stage === s && !r && (
                <div className="mt-3 flex flex-col gap-3">
                  <Stars value={stars} onChange={setStars} />
                  <Textarea
                    value={comment}
                    maxLength={2000}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="ملاحظتك (اختياري)"
                    className="min-h-[64px]"
                  />
                  <div className="flex gap-2">
                    <Button
                      loading={rate.isPending}
                      disabled={!stars}
                      onClick={submit}
                    >
                      إرسال التقييم
                    </Button>
                    <Button variant="secondary" onClick={() => setStage(null)}>
                      إلغاء
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
