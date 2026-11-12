import { Users, Wallet } from "lucide-react";
import { useClientGroupLink } from "@/hooks/useExtras";
import { Card } from "@/components/ui";

/** 01012345678 -> 201012345678 · +20101... / 0020101... -> 20101... */
export function waNumber(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) return d.slice(2);
  if (d.startsWith("0")) return "2" + d;
  return d;
}

/** زرّين واتساب: جروب متابعة الأعمال + جروب المالية. كل زر يظهر فقط لو المدير ضبط رابطه. */
export function ClientContactCard({
  projectId,
  projectTitle,
}: {
  projectId: string;
  projectTitle: string;
}) {
  const work = useClientGroupLink(projectId, "work");
  const fin = useClientGroupLink(projectId, "finance");
  if (!work.data && !fin.data) return null;
  const btn =
    "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold hover:opacity-80";
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
      <div>
        <div className="text-xs text-muted">جروبات المشروع على واتساب</div>
        <div className="font-extrabold">{projectTitle}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        {work.data && (
          <a
            href={work.data}
            target="_blank"
            rel="noopener noreferrer"
            className={`${btn} bg-ok-soft text-ok`}
          >
            <Users className="h-4 w-4" /> جروب متابعة الأعمال
          </a>
        )}
        {fin.data && (
          <a
            href={fin.data}
            target="_blank"
            rel="noopener noreferrer"
            className={`${btn} bg-brand-soft text-brand`}
          >
            <Wallet className="h-4 w-4" /> جروب المالية والدفعات
          </a>
        )}
      </div>
    </Card>
  );
}
