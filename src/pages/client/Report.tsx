import { Link, useSearchParams } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useClientDashboard, useClientUpdates, usePayments } from '@/hooks/useData'
import { Button, Spinner } from '@/components/ui'
import { fmtDate, money, todayISO } from '@/lib/format'
import { CATEGORY_LABEL, STAGE_LABEL } from '@/lib/labels'

/** Printable report. "Print → Save as PDF" in the browser keeps Arabic shaping correct. */
export default function ClientReport() {
  const { profile } = useAuth()
  const [q] = useSearchParams()
  const dash = useClientDashboard()
  const p = dash.data?.find((x) => x.id === q.get('project')) ?? dash.data?.[0]
  const ups = useClientUpdates({ projectId: p?.id, limit: 7 })
  const pay = usePayments(p?.id)

  if (dash.isLoading) return <Spinner />
  if (!p) return <div className="p-6">لا توجد بيانات.</div>

  return (
    <div className="mx-auto max-w-3xl bg-white p-6 text-black">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link to="/client" className="text-sm font-bold text-brand">رجوع</Link>
        <Button onClick={() => window.print()}><Printer className="h-4 w-4" /> طباعة / حفظ PDF</Button>
      </div>
      <h1 className="text-2xl font-black">تقرير المشروع — {p.title}</h1>
      <div className="mb-4 text-sm text-gray-600">{profile?.full_name} · {fmtDate(todayISO())}</div>

      <table className="mb-4 w-full text-sm"><tbody>
        <tr><td className="py-1 font-bold">المرحلة الحالية</td><td>{STAGE_LABEL[p.stage]}</td><td className="font-bold">نسبة الإنجاز</td><td>{p.progress_pct}%</td></tr>
        <tr><td className="py-1 font-bold">الميزانية</td><td>{money(p.budget)}</td><td className="font-bold">المصروف المعتمد</td><td>{money(p.spent)}</td></tr>
        <tr><td className="py-1 font-bold">إجمالي الدفعات</td><td>{money(p.pay_total)}</td><td className="font-bold">المدفوع</td><td>{money(p.pay_paid)}</td></tr>
      </tbody></table>

      {!!p.by_category.length && (<>
        <h2 className="mb-1 font-extrabold">المصروفات حسب البند</h2>
        <ul className="mb-4 text-sm">{p.by_category.map((c) => <li key={c.category} className="flex justify-between border-b py-1"><span>{CATEGORY_LABEL[c.category] ?? c.category}</span><span>{money(c.total)}</span></li>)}</ul>
      </>)}

      {!!pay.data?.length && (<>
        <h2 className="mb-1 font-extrabold">جدول الدفعات</h2>
        <ul className="mb-4 text-sm">{pay.data.map((x) => <li key={x.id} className="flex justify-between border-b py-1"><span>{x.title} — {fmtDate(x.due_date)}</span><span>{money(x.amount)} · {x.status === 'paid' ? 'مدفوعة' : 'مستحقة'}</span></li>)}</ul>
      </>)}

      <h2 className="mb-1 font-extrabold">آخر التقارير</h2>
      {!ups.data?.length ? <p className="text-sm">لا توجد تقارير.</p> : ups.data.map((u) => (
        <div key={u.id} className="mb-3 break-inside-avoid text-sm"><b>{fmtDate(u.date)}</b><p className="whitespace-pre-wrap">{u.summary}</p>{u.next_steps && <p className="text-gray-600">القادم: {u.next_steps}</p>}</div>
      ))}
    </div>
  )
}
