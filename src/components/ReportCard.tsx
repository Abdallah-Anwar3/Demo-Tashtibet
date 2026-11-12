import { Card } from '@/components/ui'
import { Photos } from '@/components/Photos'
import { fmtDateTime } from '@/lib/format'
import type { DailyReport } from '@/lib/types'

const Block = ({ label, value, bad }: { label: string; value: string | null; bad?: boolean }) => (
  <div>
    <div className="mb-1 text-[11px] font-extrabold text-muted">{label}</div>
    <div className={`whitespace-pre-wrap text-sm ${bad && value ? 'font-semibold text-bad' : ''}`}>{value || '—'}</div>
  </div>
)

/** One daily report with its photos (shared by the reports page and the project page). */
export function ReportCard({ r, project, engineer }: { r: DailyReport; project: string; engineer: string }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <div><div className="font-extrabold">{project}</div><div className="text-xs text-muted">{engineer} · {fmtDateTime(r.created_at)}</div></div>
        {r.progress_pct != null && <span className="num rounded-full bg-info-soft px-2.5 py-0.5 text-xs font-bold text-info">إنجاز {r.progress_pct}%</span>}
      </div>
      <div className="grid gap-4 p-5 md:grid-cols-2">
        <Block label="الأعمال المنجزة" value={r.completed_work} />
        <Block label="المتبقي" value={r.remaining_work} />
        <Block label="المشاكل والمعوقات" value={r.issues} bad />
        <Block label="ملاحظات هندسية" value={r.notes} />
        <div className="md:col-span-2">
          <div className="mb-1 text-[11px] font-extrabold text-muted">الصور</div>
          <Photos paths={r.photos_urls ?? []} label={`${project}-${r.date}`} />
        </div>
      </div>
    </Card>
  )
}
