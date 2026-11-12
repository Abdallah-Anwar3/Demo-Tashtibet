import { useState } from 'react'
import { useProjects, useReports, useTeam } from '@/hooks/useData'
import { Button, Card, Empty, Field, Input, Select, Spinner } from '@/components/ui'
import { ReportCard } from '@/components/ReportCard'

const STEP = 20

export default function Reports() {
  const [date, setDate] = useState('')
  const [projectId, setProjectId] = useState('')
  const [engineerId, setEngineerId] = useState('')
  const [limit, setLimit] = useState(STEP)
  const reports = useReports({ date: date || undefined, projectId: projectId || undefined, engineerId: engineerId || undefined, limit })
  const projects = useProjects()
  const team = useTeam()

  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setLimit(STEP) }
  const rows = reports.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-extrabold">التقارير اليومية</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Field label="التاريخ"><Input type="date" value={date} onChange={(e) => reset(setDate)(e.target.value)} /></Field>
        <Field label="الموقع"><Select value={projectId} onChange={(e) => reset(setProjectId)(e.target.value)}><option value="">الكل</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select></Field>
        <Field label="المهندس"><Select value={engineerId} onChange={(e) => reset(setEngineerId)(e.target.value)}><option value="">الكل</option>{team.data?.filter((p) => p.role === 'site_engineer').map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select></Field>
      </div>
      {reports.isLoading ? <Spinner /> : !rows.length ? <Card><Empty>لا توجد تقارير.</Empty></Card> : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <ReportCard key={r.id} r={r}
              project={projects.data?.find((p) => p.id === r.project_id)?.title ?? '—'}
              engineer={team.data?.find((p) => p.id === r.engineer_id)?.full_name ?? '—'} />
          ))}
          {rows.length >= limit && (
            <div className="text-center"><Button variant="secondary" loading={reports.isFetching} onClick={() => setLimit((l) => l + STEP)}>تحميل المزيد</Button></div>
          )}
        </div>
      )}
    </div>
  )
}
