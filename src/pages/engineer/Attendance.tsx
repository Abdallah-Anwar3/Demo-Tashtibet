import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { LogIn, LogOut, Satellite } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useGeolocation } from '@/hooks/useGeolocation'
import { useAttendance, useProjects } from '@/hooks/useData'
import { supabase } from '@/lib/supabase'
import { Badge, Button, Card, Field, Select, useToast } from '@/components/ui'
import { durationHM, fmtTime, todayISO } from '@/lib/format'
import { distanceM } from '@/lib/utils'

export default function EngAttendance() {
  const { profile } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const { locate, loading: locating, error: gpsError } = useGeolocation()
  const projects = useProjects()
  const log = useAttendance({ date: todayISO(), engineerId: profile?.id })
  const [projectId, setProjectId] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(new Date())

  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id) }, [])

  const active = projects.data?.filter((p) => p.status === 'active') ?? []
  const open = log.data?.find((a) => !a.check_out_time)
  const selected = active.find((p) => p.id === (open?.project_id ?? projectId))

  useEffect(() => { if (!projectId && active[0]) setProjectId(active[0].id) }, [active, projectId])

  const act = async () => {
    if (!selected) return
    setBusy(true)
    try {
      // GPS is optional: without it the server records the visit as "outside the site".
      const fix = await locate().catch(() => null)
      const lat = fix?.lat ?? null, lng = fix?.lng ?? null
      const { error } = open
        ? await supabase.rpc('check_out', { p_attendance: open.id, p_lat: lat, p_lng: lng })
        : await supabase.rpc('check_in', { p_project: selected.id, p_lat: lat, p_lng: lng })
      if (error) throw new Error(error.message)

      let inside = '', away = ''
      if (fix && selected.location_lat != null && selected.location_lng != null) {
        const d = Math.round(distanceM(fix.lat, fix.lng, selected.location_lat, selected.location_lng))
        inside = d <= selected.geofence_radius_m ? ' · داخل الموقع' : ''
        away = d > selected.geofence_radius_m ? ` · خارج الموقع (${d} م)` : ''
      }
      toast((open ? 'تم تسجيل المغادرة' : 'تم تسجيل الوصول') + inside + away)
      await qc.invalidateQueries({ queryKey: ['attendance'] })
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="rounded-2xl bg-navy p-5 text-white">
        <div className="text-lg font-black">{selected?.title ?? 'اختر الموقع'}</div>
        <div className="text-xs text-white/50">{selected?.address}</div>
        <div className="num mt-3 text-4xl font-black" dir="ltr">{now.toLocaleTimeString('en-GB')}</div>
        <div className="mt-3 flex items-center gap-2 text-xs text-white/70">
          <Satellite className="h-4 w-4" />
          {locating ? 'جارٍ تحديد موقعك…' : gpsError ?? 'سيتم أخذ موقعك عند الضغط على الزر'}
        </div>
      </div>

      {!open && (
        <Field label="الموقع">
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {active.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </Select>
        </Field>
      )}

      <Button size="lg" loading={busy} disabled={!selected} onClick={act}
        className={open ? '!bg-bad !text-white' : '!bg-ok !text-white'}>
        {open ? <><LogOut className="h-5 w-5" /> تسجيل مغادرة</> : <><LogIn className="h-5 w-5" /> تسجيل وصول</>}
      </Button>
      <p className="text-center text-xs text-muted">الوقت والتحقق من نطاق الموقع يتمان على الخادم ولا يمكن تعديلهما.</p>

      <Card className="p-4">
        <h3 className="mb-2 text-sm font-extrabold">سجل اليوم</h3>
        {!log.data?.length ? <div className="py-4 text-center text-sm text-muted">لا توجد تسجيلات اليوم.</div> : (
          <ul className="divide-y divide-line">
            {log.data.map((a) => {
              const p = projects.data?.find((x) => x.id === a.project_id)
              return (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <div>
                    <div className="font-bold">{p?.title ?? '—'}</div>
                    <div className="num text-xs text-muted">
                      {fmtTime(a.check_in_time)} → {a.check_out_time ? fmtTime(a.check_out_time) : 'جارٍ'} · {durationHM(a.check_in_time, a.check_out_time)}
                    </div>
                  </div>
                  <Badge tone={a.is_within_geofence ? 'ok' : 'bad'}>{a.is_within_geofence ? 'داخل الموقع' : 'خارج الموقع'}</Badge>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
