import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { useAttendance, useProjects, useTeam } from '@/hooks/useData'
import { supabase } from '@/lib/supabase'
import { Badge, Button, Card, Empty, Field, Input, Spinner, Table, Td, Th, useToast } from '@/components/ui'
import { durationHM, fmtTime, todayISO } from '@/lib/format'

export default function AttendanceAdmin() {
  const toast = useToast()
  const qc = useQueryClient()
  const [date, setDate] = useState(todayISO())
  const att = useAttendance({ date })
  const projects = useProjects()
  const team = useTeam()

  const eng = (id: string) => team.data?.find((p) => p.id === id)?.full_name ?? '—'
  const proj = (id: string) => projects.data?.find((p) => p.id === id)?.title ?? '—'

  const verify = async (id: string) => {
    const { error } = await supabase.from('attendance').update({ is_verified: true }).eq('id', id)
    if (error) toast(error.message, 'bad'); else { toast('تم اعتماد الحضور يدوياً'); void qc.invalidateQueries({ queryKey: ['attendance'] }) }
  }

  // total hours per engineer per site for the day
  const perSite = new Map<string, number>()
  att.data?.forEach((a) => {
    const end = a.check_out_time ? new Date(a.check_out_time).getTime() : Date.now()
    const k = `${a.engineer_id}|${a.project_id}`
    perSite.set(k, (perSite.get(k) ?? 0) + (end - new Date(a.check_in_time).getTime()))
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-lg font-extrabold">الحضور والانصراف الميداني</h1>
        <Field label="التاريخ"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Card>
        {att.isLoading ? <Spinner /> : !att.data?.length ? <Empty>لا توجد تسجيلات في هذا اليوم.</Empty> : (
          <Table>
            <thead><tr><Th>المهندس</Th><Th>الموقع</Th><Th>الوصول</Th><Th>المغادرة</Th><Th>المدة</Th><Th>إجمالي اليوم بالموقع</Th><Th>النطاق</Th><Th>التوثيق</Th></tr></thead>
            <tbody>
              {att.data.map((a) => {
                const total = perSite.get(`${a.engineer_id}|${a.project_id}`) ?? 0
                return (
                  <tr key={a.id} className="hover:bg-raised">
                    <Td className="font-bold">{eng(a.engineer_id)}</Td>
                    <Td>{proj(a.project_id)}</Td>
                    <Td className="num">{fmtTime(a.check_in_time)}</Td>
                    <Td className="num">{a.check_out_time ? fmtTime(a.check_out_time) : <Badge tone="info">جارٍ</Badge>}</Td>
                    <Td className="num">{durationHM(a.check_in_time, a.check_out_time)}</Td>
                    <Td className="num text-xs text-muted">{Math.floor(total / 3600000)} س {String(Math.round((total % 3600000) / 60000)).padStart(2, '0')} د</Td>
                    <Td><Badge tone={a.is_within_geofence ? 'ok' : 'bad'}>{a.is_within_geofence ? 'داخل الموقع' : 'خارج الموقع'}</Badge></Td>
                    <Td>{a.is_verified ? <Badge tone="ok">موثّق</Badge> : <Button size="sm" variant="secondary" onClick={() => void verify(a.id)}><ShieldCheck className="h-3.5 w-3.5" /> اعتماد يدوي</Button>}</Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  )
}
