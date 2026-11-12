import { useState } from 'react'
import { Calculator, Download, Printer } from 'lucide-react'
import { useCalculatePayroll, usePayroll, useTeam, useUpdatePayroll } from '@/hooks/useData'
import { Badge, Button, Card, Empty, Select, Spinner, Table, Td, Th, useToast } from '@/components/ui'
import { downloadCSV, money, num } from '@/lib/format'
import { MONTHS_AR } from '@/lib/labels'
import type { PayrollRecord } from '@/lib/types'

const STATUS: Record<PayrollRecord['status'], { label: string; tone: 'warn' | 'ok' | 'info' }> = {
  draft: { label: 'مسودة', tone: 'warn' }, approved: { label: 'معتمد', tone: 'info' }, paid: { label: 'تم الصرف', tone: 'ok' },
}

/** Number cell that saves on blur. Only drafts are editable. */
function Money({ value, locked, onSave }: { value: number; locked: boolean; onSave: (n: number) => void }) {
  const [v, setV] = useState(String(value))
  if (locked) return <span className="num">{num(value)}</span>
  return (
    <input dir="ltr" type="number" min="0" value={v} aria-label="قيمة"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { const n = Number(v) || 0; if (n !== value) onSave(n) }}
      className="num w-24 rounded-md border border-line bg-raised px-2 py-1 text-sm outline-none focus:border-brand" />
  )
}

export default function Payroll() {
  const toast = useToast()
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const payroll = usePayroll(month, year)
  const team = useTeam()
  const calc = useCalculatePayroll()
  const update = useUpdatePayroll()

  const name = (id: string) => team.data?.find((p) => p.id === id)?.full_name ?? '—'
  const rows = [...(payroll.data ?? [])].sort((a, b) => name(a.engineer_id).localeCompare(name(b.engineer_id), 'ar'))
  const sum = (k: keyof PayrollRecord) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0)

  const save = (id: string, patch: Partial<PayrollRecord>) =>
    update.mutate({ id, ...patch }, { onError: (e) => toast((e as Error).message, 'bad') })

  const run = () => calc.mutate({ month, year }, {
    onSuccess: (n) => toast(`تم احتساب مرتبات ${n} مهندس`),
    onError: (e) => toast((e as Error).message, 'bad'),
  })

  const exportCsv = () =>
    downloadCSV(`payroll-${year}-${String(month).padStart(2, '0')}.csv`, [
      ['المهندس', 'أيام ميدانية', 'الراتب الأساسي', 'بدل النزول', 'مكافآت', 'سلف', 'خصومات', 'الصافي', 'الحالة'],
      ...rows.map((r) => [name(r.engineer_id), r.field_days, r.base_salary, r.allowances, r.bonuses, r.advances, r.deductions, r.net_salary, STATUS[r.status].label]),
    ])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <h1 className="me-auto text-lg font-extrabold">المرتبات والبدلات</h1>
        <Select className="!w-auto" value={month} onChange={(e) => setMonth(Number(e.target.value))}>{MONTHS_AR.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</Select>
        <Select className="!w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>{[year - 1, year, year + 1].filter((v, i, a) => a.indexOf(v) === i).map((y) => <option key={y}>{y}</option>)}</Select>
        <Button loading={calc.isPending} onClick={run}><Calculator className="h-4 w-4" /> احتساب الشهر</Button>
        <Button variant="secondary" onClick={exportCsv} disabled={!rows.length}><Download className="h-4 w-4" /> CSV</Button>
        <Button variant="secondary" onClick={() => window.print()} disabled={!rows.length}><Printer className="h-4 w-4" /> PDF / طباعة</Button>
      </div>
      <p className="text-xs text-muted print:hidden">بدل النزول = عدد الأيام الميدانية الموثقة (حضور داخل نطاق الموقع مع تسجيل مغادرة) × بدل اليوم. إعادة الاحتساب تحدّث المسودات فقط وتحتفظ بالمكافآت والسلف والخصومات المدخلة يدوياً.</p>

      <div className="hidden text-center text-lg font-extrabold print:block">كشف مرتبات {MONTHS_AR[month - 1]} {year}</div>

      <Card>
        {payroll.isLoading ? <Spinner /> : !rows.length ? <Empty>لا يوجد كشف لهذا الشهر. اضغط «احتساب الشهر».</Empty> : (
          <Table>
            <thead><tr><Th>المهندس</Th><Th>أيام ميدانية</Th><Th>الأساسي</Th><Th>بدل النزول</Th><Th>مكافآت التسليم</Th><Th>سلف شخصية</Th><Th>خصومات</Th><Th>صافي الراتب</Th><Th>الحالة</Th><Th className="print:hidden" /></tr></thead>
            <tbody>
              {rows.map((r) => {
                const locked = r.status !== 'draft'
                return (
                  <tr key={r.id}>
                    <Td className="font-bold">{name(r.engineer_id)}</Td>
                    <Td className="num">{r.field_days}</Td>
                    <Td className="num">{num(r.base_salary)}</Td>
                    <Td className="num text-ok">{num(r.allowances)}</Td>
                    <Td><Money key={`b${r.bonuses}`} value={r.bonuses} locked={locked} onSave={(n) => save(r.id, { bonuses: n })} /></Td>
                    <Td><Money key={`a${r.advances}`} value={r.advances} locked={locked} onSave={(n) => save(r.id, { advances: n })} /></Td>
                    <Td><Money key={`d${r.deductions}`} value={r.deductions} locked={locked} onSave={(n) => save(r.id, { deductions: n })} /></Td>
                    <Td className="num text-base font-black text-brand-dark">{money(r.net_salary)}</Td>
                    <Td><Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge></Td>
                    <Td className="print:hidden">
                      {r.status === 'draft' && <Button size="sm" variant="ok" onClick={() => save(r.id, { status: 'approved' })}>اعتماد</Button>}
                      {r.status === 'approved' && <Button size="sm" variant="secondary" onClick={() => save(r.id, { status: 'paid' })}>تم الصرف</Button>}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-raised font-extrabold">
                <Td>الإجمالي</Td><Td className="num">{sum('field_days')}</Td><Td className="num">{num(sum('base_salary'))}</Td><Td className="num">{num(sum('allowances'))}</Td>
                <Td className="num">{num(sum('bonuses'))}</Td><Td className="num">{num(sum('advances'))}</Td><Td className="num">{num(sum('deductions'))}</Td>
                <Td className="num text-base text-brand-dark">{money(sum('net_salary'))}</Td><Td /><Td className="print:hidden" />
              </tr>
            </tfoot>
          </Table>
        )}
      </Card>
    </div>
  )
}
