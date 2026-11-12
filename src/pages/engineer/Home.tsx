import { Link } from 'react-router-dom'
import { Clock, MapPin, Navigation, Wallet } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAttendance, useMyWallet, useProjects } from '@/hooks/useData'
import { Badge, Card, Empty, Spinner } from '@/components/ui'
import { fmtTime, money, todayISO } from '@/lib/format'
import { mapsLink } from '@/lib/utils'
import { STAGE_LABEL } from '@/lib/labels'

export default function EngHome() {
  const { profile } = useAuth()
  const wallet = useMyWallet(profile?.id)
  const projects = useProjects()
  const today = useAttendance({ date: todayISO(), engineerId: profile?.id })

  const open = today.data?.find((a) => !a.check_out_time)

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1a3e] to-[#2d1b69] p-5 text-white">
        <div className="text-xs font-semibold opacity-70">رصيد العهدة الحالي</div>
        <div className="num mt-1 text-4xl font-black">{wallet.isLoading ? '…' : money(wallet.data?.current_balance)}</div>
        <div className="mt-1 text-[11px] opacity-60">إجمالي ما صُرف لك: {money(wallet.data?.total_disbursed)}</div>
        <Wallet className="absolute -start-3 top-1/2 h-24 w-24 -translate-y-1/2 opacity-10" />
      </div>

      <div>
        <h2 className="mb-3 font-extrabold">مواقعي</h2>
        {projects.isLoading ? <Spinner /> : !projects.data?.length ? (
          <Card><Empty>لم يتم إسناد أي موقع إليك بعد. تواصل مع الإدارة.</Empty></Card>
        ) : (
          <div className="flex flex-col gap-3">
            {projects.data.filter((p) => p.status === 'active').map((p) => {
              const here = open?.project_id === p.id
              const link = mapsLink(p.location_lat, p.location_lng)
              return (
                <Card key={p.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-base font-extrabold">{p.title}</div>
                      <div className="text-xs text-muted">{p.client_name}</div>
                    </div>
                    {here ? <Badge tone="ok">● حاضر</Badge> : <Badge>{STAGE_LABEL[p.stage]}</Badge>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    {p.address && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{p.address}</span>}
                    {here && open && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />منذ {fmtTime(open.check_in_time)}</span>}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Link to="/app/attendance" className="flex-1 rounded-lg bg-brand py-2 text-center text-sm font-bold text-white">
                      {here ? 'تسجيل مغادرة' : 'تسجيل وصول'}
                    </Link>
                    <Link to="/app/report" className="flex-1 rounded-lg border border-line py-2 text-center text-sm font-bold">تقرير اليوم</Link>
                    {link && (
                      <a href={link} target="_blank" rel="noreferrer" aria-label="الاتجاهات"
                        className="grid w-11 place-items-center rounded-lg border border-line text-brand"><Navigation className="h-4 w-4" /></a>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
