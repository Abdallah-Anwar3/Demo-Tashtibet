import { useState } from 'react'
import { useClientDashboard, useClientUpdates } from '@/hooks/useData'
import { Button, Card, Empty, ErrorNote, Select, Spinner } from '@/components/ui'
import { Photos } from '@/components/Photos'
import { fmtDate } from '@/lib/format'

const STEP = 15

/** The daily reports a manager published for this client, newest first. */
export default function ClientUpdates() {
  const dash = useClientDashboard()
  const [projectId, setProjectId] = useState('')
  const [limit, setLimit] = useState(STEP)
  const updates = useClientUpdates({ projectId: projectId || undefined, limit })
  const rows = updates.data ?? []
  const title = (id: string) => dash.data?.find((p) => p.id === id)?.title ?? ''

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-lg font-extrabold">تقارير اليوم</h1>
      {(dash.data?.length ?? 0) > 1 && (
        <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); setLimit(STEP) }} aria-label="المشروع">
          <option value="">كل المشاريع</option>
          {dash.data?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </Select>
      )}
      <ErrorNote error={updates.error} />
      {updates.isLoading ? <Spinner /> : !rows.length ? <Card><Empty>لا توجد تقارير منشورة بعد.</Empty></Card> : (
        <div className="flex flex-col gap-3">
          {rows.map((u) => (
            <Card key={u.id} className="flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between text-xs text-muted"><b className="text-fg">{title(u.project_id)}</b><span className="num">{fmtDate(u.date)}</span></div>
              <div><div className="mb-1 text-[11px] font-extrabold text-muted">ما تم إنجازه</div><p className="whitespace-pre-wrap text-sm">{u.summary}</p></div>
              {u.next_steps && <div><div className="mb-1 text-[11px] font-extrabold text-muted">الخطوات القادمة</div><p className="whitespace-pre-wrap text-sm">{u.next_steps}</p></div>}
              <Photos paths={u.photos} label={`${title(u.project_id)}-${u.date}`} />
            </Card>
          ))}
          {rows.length >= limit && <div className="text-center"><Button variant="secondary" loading={updates.isFetching} onClick={() => setLimit((l) => l + STEP)}>تحميل المزيد</Button></div>}
        </div>
      )}
    </div>
  )
}
