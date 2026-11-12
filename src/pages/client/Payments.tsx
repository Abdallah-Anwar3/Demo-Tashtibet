import { useState } from 'react'
import { useClientDashboard, usePayments } from '@/hooks/useData'
import { Badge, Card, Empty, ErrorNote, Select, Spinner } from '@/components/ui'
import { fmtDate, money, todayISO } from '@/lib/format'

/** The payment schedule of the project: what was paid, what is due next. */
export default function ClientPayments() {
  const dash = useClientDashboard()
  const [sel, setSel] = useState('')
  const projects = dash.data ?? []
  const p = projects.find((x) => x.id === sel) ?? projects[0]
  const pay = usePayments(p?.id)

  if (dash.isLoading) return <Spinner />
  if (!p) return <Card><Empty>لا توجد مشاريع مرتبطة بحسابك.</Empty></Card>
  const remaining = p.pay_total - p.pay_paid
  const today = todayISO()

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-lg font-extrabold">الدفعات</h1>
      {projects.length > 1 && (
        <Select value={p.id} onChange={(e) => setSel(e.target.value)} aria-label="المشروع">{projects.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select>
      )}
      <div className="grid grid-cols-3 gap-3 text-center">
        {[['الإجمالي', p.pay_total], ['المدفوع', p.pay_paid], ['المتبقي', remaining]].map(([l, v]) => (
          <Card key={l as string} className="p-3"><div className="text-[11px] text-muted">{l}</div><div className="num mt-1 text-sm font-black">{money(v as number)}</div></Card>
        ))}
      </div>
      <ErrorNote error={pay.error} />
      <Card>
        {pay.isLoading ? <Spinner /> : !pay.data?.length ? <Empty>لم يتم تحديد جدول دفعات بعد.</Empty> : (
          <ul className="divide-y divide-line">
            {pay.data.map((x) => {
              const late = x.status === 'pending' && x.due_date < today
              return (
                <li key={x.id} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <div className="font-bold">{x.title}</div>
                    <div className="num text-xs text-muted">{x.status === 'paid' && x.paid_at ? `سُددت ${fmtDate(x.paid_at)}` : `الاستحقاق ${fmtDate(x.due_date)}`}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="num font-extrabold">{money(x.amount)}</span>
                    <Badge tone={x.status === 'paid' ? 'ok' : late ? 'bad' : 'warn'}>{x.status === 'paid' ? 'مدفوعة' : late ? 'متأخرة' : 'مستحقة'}</Badge>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
