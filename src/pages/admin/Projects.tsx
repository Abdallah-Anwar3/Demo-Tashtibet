import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Navigation, Pencil, Plus } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useProjects, useSaveProject, useSpendByProject, useTeam } from '@/hooks/useData'
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, Select, Spinner, Table, Td, Th, useToast } from '@/components/ui'
import { fmtDate, money } from '@/lib/format'
import { PROJECT_STATUS_LABEL, STAGES, STAGE_LABEL } from '@/lib/labels'
import { cn, mapsLink } from '@/lib/utils'
import type { Project, ProjectStage, ProjectStatus } from '@/lib/types'

const blank = {
  title: '', client_name: '', address: '', location_lat: '', location_lng: '', geofence_radius_m: '300',
  status: 'active' as ProjectStatus, stage: 'foundation' as ProjectStage, budget: '', start_date: '', delivery_date: '',
  assigned_engineer_ids: [] as string[], progress_pct: '0',
}
type Form = typeof blank

const toForm = (p: Project): Form => ({
  title: p.title, client_name: p.client_name, address: p.address ?? '',
  location_lat: p.location_lat?.toString() ?? '', location_lng: p.location_lng?.toString() ?? '',
  geofence_radius_m: String(p.geofence_radius_m), status: p.status, stage: p.stage, budget: String(p.budget),
  start_date: p.start_date ?? '', delivery_date: p.delivery_date ?? '', assigned_engineer_ids: p.assigned_engineer_ids ?? [], progress_pct: String(p.progress_pct ?? 0),
})

export default function Projects() {
  const { isManager } = useAuth()
  const toast = useToast()
  const projects = useProjects()
  const team = useTeam()
  const spend = useSpendByProject()
  const save = useSaveProject()
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [f, setF] = useState<Form>(blank)

  const engineers = team.data?.filter((p) => p.role === 'site_engineer' && p.is_active) ?? []
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }))

  const open = (p?: Project) => { setF(p ? toForm(p) : blank); setEditing(p?.id ?? 'new'); save.reset() }

  const submit = () => {
    if (!f.title.trim() || !f.client_name.trim()) { toast('اسم المشروع واسم العميل مطلوبان', 'bad'); return }
    save.mutate({
      id: editing && editing !== 'new' ? editing : undefined,
      title: f.title.trim(), client_name: f.client_name.trim(), address: f.address.trim() || null,
      location_lat: f.location_lat ? Number(f.location_lat) : null, location_lng: f.location_lng ? Number(f.location_lng) : null,
      geofence_radius_m: Number(f.geofence_radius_m) || 300, status: f.status, stage: f.stage,
      budget: Number(f.budget) || 0, start_date: f.start_date || null, delivery_date: f.delivery_date || null,
      assigned_engineer_ids: f.assigned_engineer_ids,
      progress_pct: Math.min(100, Math.max(0, Math.round(Number(f.progress_pct) || 0))),
    }, { onSuccess: () => { toast('تم حفظ المشروع'); setEditing(null) } })
  }

  const toggleEng = (id: string) =>
    set('assigned_engineer_ids', f.assigned_engineer_ids.includes(id) ? f.assigned_engineer_ids.filter((x) => x !== id) : [...f.assigned_engineer_ids, id])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-extrabold">المشاريع والمواقع</h1>
        {isManager && <Button onClick={() => open()}><Plus className="h-4 w-4" /> مشروع جديد</Button>}
      </div>

      <Card>
        {projects.isLoading ? <Spinner /> : !projects.data?.length ? <Empty>لا توجد مشاريع بعد. أضف أول مشروع.</Empty> : (
          <Table>
            <thead><tr><Th>المشروع</Th><Th>المرحلة</Th><Th>المهندسون</Th><Th>الميزانية</Th><Th>المنصرف</Th><Th>التسليم</Th><Th>الحالة</Th><Th /></tr></thead>
            <tbody>
              {projects.data.map((p) => {
                const spent = spend.data?.[p.id] ?? 0
                const link = mapsLink(p.location_lat, p.location_lng)
                return (
                  <tr key={p.id} className="hover:bg-raised">
                    <Td><Link to={`/admin/projects/${p.id}`} className="font-bold text-brand hover:underline">{p.title}</Link><div className="text-xs text-muted">{p.client_name}</div></Td>
                    <Td><Badge tone="brand">{STAGE_LABEL[p.stage]}</Badge></Td>
                    <Td className="text-xs">{p.assigned_engineer_ids.map((id) => team.data?.find((t) => t.id === id)?.full_name).filter(Boolean).join('، ') || '—'}</Td>
                    <Td className="num">{money(p.budget)}</Td>
                    <Td className={cn('num font-bold', p.budget > 0 && spent > p.budget && 'text-bad')}>{money(spent)}</Td>
                    <Td className="text-xs">{p.delivery_date ? fmtDate(p.delivery_date) : '—'}</Td>
                    <Td><Badge tone={p.status === 'active' ? 'ok' : p.status === 'completed' ? 'info' : 'gray'}>{PROJECT_STATUS_LABEL[p.status]}</Badge></Td>
                    <Td>
                      <div className="flex gap-1">
                        {link && <a href={link} target="_blank" rel="noreferrer" aria-label="الاتجاهات" className="rounded-lg p-2 text-muted hover:bg-raised"><Navigation className="h-4 w-4" /></a>}
                        {isManager && <button aria-label="تعديل" onClick={() => open(p)} className="rounded-lg p-2 text-muted hover:bg-raised"><Pencil className="h-4 w-4" /></button>}
                      </div>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'إضافة مشروع جديد' : 'تعديل المشروع'}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>إلغاء</Button><Button loading={save.isPending} onClick={submit}>حفظ المشروع</Button></>}>
        <div className="flex flex-col gap-3.5">
          <Field label="اسم الموقع / المشروع *"><Input value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
          <Field label="اسم العميل *"><Input value={f.client_name} onChange={(e) => set('client_name', e.target.value)} /></Field>
          <Field label="العنوان"><Input value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="خط العرض"><Input dir="ltr" type="number" step="any" value={f.location_lat} onChange={(e) => set('location_lat', e.target.value)} /></Field>
            <Field label="خط الطول"><Input dir="ltr" type="number" step="any" value={f.location_lng} onChange={(e) => set('location_lng', e.target.value)} /></Field>
            <Field label="النطاق (م)"><Input dir="ltr" type="number" value={f.geofence_radius_m} onChange={(e) => set('geofence_radius_m', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="المرحلة"><Select value={f.stage} onChange={(e) => set('stage', e.target.value as ProjectStage)}>{STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</Select></Field>
            <Field label="الحالة"><Select value={f.status} onChange={(e) => set('status', e.target.value as ProjectStatus)}>{Object.entries(PROJECT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="تاريخ البداية"><Input type="date" value={f.start_date} onChange={(e) => set('start_date', e.target.value)} /></Field>
            <Field label="تاريخ التسليم"><Input type="date" value={f.delivery_date} onChange={(e) => set('delivery_date', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="الميزانية (ج.م.)"><Input dir="ltr" type="number" value={f.budget} onChange={(e) => set('budget', e.target.value)} /></Field>
            <Field label="نسبة الإنجاز %"><Input dir="ltr" type="number" min={0} max={100} value={f.progress_pct} onChange={(e) => set('progress_pct', e.target.value)} /></Field>
          </div>
          <div>
            <div className="mb-2 text-xs font-bold text-muted">المهندسون المسؤولون</div>
            <div className="flex flex-wrap gap-2">
              {engineers.length ? engineers.map((e) => (
                <label key={e.id} className={cn('cursor-pointer rounded-full border px-3 py-1.5 text-xs font-bold transition',
                  f.assigned_engineer_ids.includes(e.id) ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line text-muted')}>
                  <input type="checkbox" className="sr-only" checked={f.assigned_engineer_ids.includes(e.id)} onChange={() => toggleEng(e.id)} />
                  {e.full_name}
                </label>
              )) : <span className="text-xs text-muted">أضف مهندسين من صفحة الفريق أولاً.</span>}
            </div>
          </div>
          <ErrorNote error={save.error} />
        </div>
      </Modal>
    </div>
  )
}
