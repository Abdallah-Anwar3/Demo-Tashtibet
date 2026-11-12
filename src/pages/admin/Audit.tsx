import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AUDIT_PAGE, useAuditLog, useTeam } from '@/hooks/useData'
import { Badge, Button, Card, Empty, ErrorNote, Spinner, Table, Td, Th } from '@/components/ui'
import { fmtDateTime } from '@/lib/format'
import { CATEGORY_LABEL, EXPENSE_STATUS_LABEL, PROJECT_STATUS_LABEL, STAGE_LABEL } from '@/lib/labels'

const ACTION: Record<string, { label: string; tone: 'ok' | 'info' | 'bad' }> = {
  insert: { label: 'إضافة', tone: 'ok' }, create: { label: 'إنشاء', tone: 'ok' },
  update: { label: 'تعديل', tone: 'info' }, delete: { label: 'حذف', tone: 'bad' },
}
const ENTITY: Record<string, string> = {
  expenses: 'مصروف', payroll_records: 'مرتب', projects: 'مشروع', custody_wallets: 'عهدة', profiles: 'حساب مستخدم',
}
const COLUMN: Record<string, string> = {
  status: 'الحالة', amount: 'المبلغ', stage: 'المرحلة', budget: 'الميزانية', title: 'الاسم', progress_pct: 'الإنجاز %',
  total_disbursed: 'إجمالي العهدة', net_salary: 'الصافي', bonuses: 'المكافآت', deductions: 'الخصومات', advances: 'السلف',
  role: 'الدور', is_active: 'نشط', full_name: 'الاسم', base_salary: 'الراتب الأساسي', email: 'البريد', category: 'الفئة',
}

/** Human-readable value; known enums are translated, everything else is shown as-is. */
function show(col: string, v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'نعم' : 'لا'
  const s = String(v)
  if (col === 'status') return EXPENSE_STATUS_LABEL[s as keyof typeof EXPENSE_STATUS_LABEL] ?? PROJECT_STATUS_LABEL[s as keyof typeof PROJECT_STATUS_LABEL] ?? s
  if (col === 'stage') return STAGE_LABEL[s as keyof typeof STAGE_LABEL] ?? s
  if (col === 'category') return CATEGORY_LABEL[s as keyof typeof CATEGORY_LABEL] ?? s
  return typeof v === 'object' ? JSON.stringify(v) : s
}

function Details({ d }: { d: Record<string, unknown> | null }) {
  const entries = Object.entries(d ?? {})
  if (!entries.length) return <span className="text-muted">—</span>
  return (
    <ul className="flex flex-col gap-0.5 text-xs">
      {entries.map(([k, v]) => {
        const change = v && typeof v === 'object' && 'new' in (v as object)
        const o = v as { old?: unknown; new?: unknown }
        return (
          <li key={k}>
            <span className="font-bold">{COLUMN[k] ?? k}:</span>{' '}
            {change ? <><span className="text-muted line-through">{show(k, o.old)}</span> ← <span className="num font-bold">{show(k, o.new)}</span></> : <span className="num">{show(k, v)}</span>}
          </li>
        )
      })}
    </ul>
  )
}

export default function Audit() {
  const [page, setPage] = useState(0)
  const log = useAuditLog(page)
  const team = useTeam()
  const rows = log.data?.rows ?? []
  const pages = Math.max(1, Math.ceil((log.data?.count ?? 0) / AUDIT_PAGE))

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-extrabold">سجل التعديلات</h1>
      <p className="text-xs text-muted">كل تغيير حساس (اعتماد/رفض المصروفات، المرتبات، المشاريع، العهد، الحسابات) يُسجَّل تلقائياً ولا يمكن تعديله.</p>
      <Card>
        <ErrorNote error={log.error} />
        {log.isLoading ? <Spinner /> : !rows.length ? <Empty>لا توجد سجلات.</Empty> : (
          <Table>
            <thead><tr><Th>الوقت</Th><Th>المنفّذ</Th><Th>العملية</Th><Th>العنصر</Th><Th>التفاصيل</Th></tr></thead>
            <tbody>
              {rows.map((a) => {
                const act = ACTION[a.action] ?? { label: a.action, tone: 'info' as const }
                return (
                  <tr key={a.id} className="align-top hover:bg-raised">
                    <Td className="whitespace-nowrap text-xs">{fmtDateTime(a.created_at)}</Td>
                    <Td className="font-bold">{team.data?.find((p) => p.id === a.actor_id)?.full_name ?? '—'}</Td>
                    <Td><Badge tone={act.tone}>{act.label}</Badge></Td>
                    <Td>{ENTITY[a.entity] ?? a.entity}</Td>
                    <Td><Details d={a.details} /></Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
        {!!rows.length && (
          <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
            <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="السابق"><ChevronRight className="h-4 w-4" /></Button>
            <span className="num text-xs font-bold">{page + 1} / {pages}</span>
            <Button size="sm" variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} aria-label="التالي"><ChevronLeft className="h-4 w-4" /></Button>
          </div>
        )}
      </Card>
    </div>
  )
}
