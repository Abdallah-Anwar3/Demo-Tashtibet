import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useClientDashboard, useCreateRequest, useRequests } from '@/hooks/useData'
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, Select, Spinner, Textarea, useToast } from '@/components/ui'
import { RequestThread } from '@/components/RequestThread'
import { fmtDate } from '@/lib/format'
import { REQUEST_KIND_LABEL, REQUEST_STATUS_LABEL } from '@/lib/labels'
import type { RequestKind } from '@/lib/types'

const TONE = { open: 'warn', in_progress: 'info', resolved: 'ok' } as const

/** Client → company: notes, complaints and change requests, with a reply thread. */
export default function ClientRequests() {
  const { profile } = useAuth()
  const toast = useToast()
  const dash = useClientDashboard()
  const reqs = useRequests()
  const create = useCreateRequest()
  const [open, setOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [f, setF] = useState({ project_id: '', kind: 'note' as RequestKind, subject: '', body: '' })
  const [err, setErr] = useState<unknown>(null)

  const projects = dash.data ?? []
  const nameOf = (id: string) => (id === profile?.id ? 'أنت' : 'الشركة')

  const submit = () => {
    const project_id = f.project_id || projects[0]?.id
    if (!profile || !project_id) return
    if (!f.subject.trim() || !f.body.trim()) { setErr(new Error('اكتب العنوان والتفاصيل')); return }
    create.mutate({ project_id, client_id: profile.id, kind: f.kind, subject: f.subject.trim(), body: f.body.trim() }, {
      onSuccess: () => { toast('تم إرسال طلبك'); setOpen(false); setF({ project_id: '', kind: 'note', subject: '', body: '' }); setErr(null) },
      onError: (e) => setErr(e),
    })
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-extrabold">طلباتي وملاحظاتي</h1>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> طلب جديد</Button>
      </div>
      <ErrorNote error={reqs.error} />
      {reqs.isLoading ? <Spinner /> : !reqs.data?.length ? <Card><Empty>لا توجد طلبات. اكتب لنا أي ملاحظة أو طلب تعديل.</Empty></Card> : (
        <div className="flex flex-col gap-3">
          {reqs.data.map((r) => (
            <Card key={r.id} className="p-4">
              <button className="flex w-full items-start justify-between gap-3 text-start" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                <div>
                  <div className="font-bold">{r.subject}</div>
                  <div className="text-xs text-muted">{REQUEST_KIND_LABEL[r.kind]} · {fmtDate(r.created_at)}</div>
                </div>
                <Badge tone={TONE[r.status]}>{REQUEST_STATUS_LABEL[r.status]}</Badge>
              </button>
              {openId === r.id && <div className="mt-3"><RequestThread request={r} nameOf={nameOf} /></div>}
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="طلب جديد"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>إلغاء</Button><Button loading={create.isPending} onClick={submit}>إرسال</Button></>}>
        <div className="flex flex-col gap-3.5">
          {projects.length > 1 && (
            <Field label="المشروع"><Select value={f.project_id || projects[0].id} onChange={(e) => setF({ ...f, project_id: e.target.value })}>{projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select></Field>
          )}
          <Field label="النوع"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as RequestKind })}>{Object.entries(REQUEST_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="العنوان"><Input value={f.subject} maxLength={200} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
          <Field label="التفاصيل"><Textarea value={f.body} maxLength={4000} onChange={(e) => setF({ ...f, body: e.target.value })} className="min-h-[110px]" /></Field>
          <ErrorNote error={err} />
        </div>
      </Modal>
    </div>
  )
}
