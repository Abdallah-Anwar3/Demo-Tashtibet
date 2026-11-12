import { useEffect, useMemo, useState } from 'react'
import { Mail, Send, Wand2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useClientUpdates, useReports, useSaveClientUpdate, useSendClientUpdate } from '@/hooks/useData'
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Textarea, useToast } from '@/components/ui'
import { Photos } from '@/components/Photos'
import { signedUrls } from '@/lib/imageUtils'
import { fmtDate, fmtDateTime, todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Manager tool: write the curated update the client sees, pick photos, optionally e-mail it. */
export function ClientUpdatePanel({ projectId, projectTitle }: { projectId: string; projectTitle: string }) {
  const { profile } = useAuth()
  const toast = useToast()
  const [date, setDate] = useState(todayISO())
  const [summary, setSummary] = useState('')
  const [next, setNext] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [email, setEmail] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)

  const reports = useReports({ projectId, date, limit: 20 })
  const history = useClientUpdates({ projectId, limit: 20 })
  const save = useSaveClientUpdate()
  const send = useSendClientUpdate()

  const dayPhotos = useMemo(() => (reports.data ?? []).flatMap((r) => r.photos_urls ?? []), [reports.data])
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  useEffect(() => {
    let live = true
    if (dayPhotos.length) void signedUrls('site-reports', dayPhotos).then((u) => live && setThumbs(Object.fromEntries(dayPhotos.map((p, i) => [p, u[i]]))))
    return () => { live = false }
  }, [dayPhotos])

  // Switching the date loads that day's existing update (if any) so it can be corrected.
  const existing = history.data?.find((u) => u.date === date)
  useEffect(() => {
    setSummary(existing?.summary ?? ''); setNext(existing?.next_steps ?? ''); setPicked(existing?.photos ?? [])
  }, [existing?.id, date]) // eslint-disable-line react-hooks/exhaustive-deps

  // Draft from the engineers' "completed work" only. Issues and internal notes are never copied.
  const draft = () => {
    const lines = (reports.data ?? []).map((r) => r.completed_work?.trim()).filter(Boolean)
    if (!lines.length) { toast('لا توجد تقارير لهذا اليوم', 'bad'); return }
    setSummary(lines.join('\n'))
  }

  const togglePhoto = (p: string) => setPicked((a) => (a.includes(p) ? a.filter((x) => x !== p) : [...a, p]))

  const publish = async () => {
    if (!profile) return
    if (!summary.trim()) { setErr(new Error('اكتب ملخص ما تم إنجازه')); return }
    setBusy(true); setErr(null)
    try {
      const id = await save.mutateAsync({
        project_id: projectId, date, summary: summary.trim(), next_steps: next.trim() || null, photos: picked, published_by: profile.id,
      })
      if (email) {
        const r = await send.mutateAsync(id)
        toast(r.sent ? `تم النشر وإرسال الإيميل إلى ${r.sent} عميل` : 'تم النشر، لكن لم يُرسل أي إيميل', r.sent ? 'ok' : 'bad')
      } else toast('تم نشر التقرير للعميل')
    } catch (e) {
      // The update is saved before the e-mail step, so a failure here means the e-mail (see history).
      setErr(e)
      void history.refetch()
    } finally { setBusy(false) }
  }

  const resend = (id: string) =>
    send.mutate(id, {
      onSuccess: (r) => toast(r.sent ? `أُرسل إلى ${r.sent} عميل` : 'لم يُرسل أي إيميل', r.sent ? 'ok' : 'bad'),
      onError: (e) => toast((e as Error).message, 'bad'),
    })

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-extrabold">تقرير العميل — {projectTitle}</h3>
            <p className="text-xs text-muted">ما تكتبه هنا هو فقط ما يراه العميل. لا تُنسخ المعوقات أو الملاحظات الداخلية تلقائياً.</p>
          </div>
          <Field label="التاريخ"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>

        <Field label="ما تم إنجازه *">
          <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} className="min-h-[110px]" />
        </Field>
        <div><Button size="sm" variant="secondary" onClick={draft}><Wand2 className="h-3.5 w-3.5" /> املأ من تقارير المهندسين لهذا اليوم</Button></div>
        <Field label="الخطوات القادمة"><Textarea value={next} onChange={(e) => setNext(e.target.value)} className="min-h-[64px]" /></Field>

        <div>
          <div className="mb-2 text-xs font-bold text-muted">صور للعميل (من تقارير اليوم) — {picked.length} مختارة</div>
          {!dayPhotos.length ? <span className="text-xs text-muted">لا توجد صور في تقارير هذا اليوم.</span> : (
            <div className="flex flex-wrap gap-2">
              {dayPhotos.map((p) => (
                <button key={p} type="button" onClick={() => togglePhoto(p)} aria-pressed={picked.includes(p)} aria-label="اختيار الصورة"
                  className={cn('overflow-hidden rounded-lg border-2', picked.includes(p) ? 'border-brand' : 'border-transparent opacity-60')}>
                  {thumbs[p] ? <img src={thumbs[p]} alt="" className="h-16 w-16 object-cover" /> : <div className="h-16 w-16 bg-raised" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> أرسل نسخة بالإيميل للعميل
        </label>
        <ErrorNote error={err} />
        <div><Button loading={busy} onClick={() => void publish()}><Send className="h-4 w-4" /> {existing ? 'تحديث ونشر' : 'نشر للعميل'}</Button></div>
      </Card>

      <Card>
        <div className="border-b border-line px-5 py-3 text-sm font-extrabold">التقارير المنشورة</div>
        {!history.data?.length ? <Empty>لم يُنشر شيء بعد.</Empty> : (
          <ul className="divide-y divide-line">
            {history.data.map((u) => (
              <li key={u.id} className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <b className="num">{fmtDate(u.date)}</b>
                  <span className="flex items-center gap-2">
                    {u.emailed_at ? <Badge tone="ok">أُرسل {fmtDateTime(u.emailed_at)}</Badge> : <Badge tone="gray">لم يُرسل بالإيميل</Badge>}
                    <Button size="sm" variant="secondary" loading={send.isPending && send.variables === u.id} onClick={() => resend(u.id)}><Mail className="h-3.5 w-3.5" /> {u.emailed_at ? 'إعادة إرسال' : 'إرسال'}</Button>
                  </span>
                </div>
                <p className="line-clamp-3 whitespace-pre-wrap text-sm">{u.summary}</p>
                {!!u.photos.length && <Photos paths={u.photos} label={`${projectTitle}-${u.date}`} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
