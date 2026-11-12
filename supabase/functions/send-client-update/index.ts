// Supabase Edge Function: send-client-update
//
// Emails a published client update to the clients linked to the project (via Resend).
// Only an active admin / project manager may call it. Needs the secret RESEND_API_KEY
// and (recommended) MAIL_FROM, e.g. "Company <updates@yourdomain.com>", plus APP_URL.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const nl = (s: unknown) => esc(s).replace(/\n/g, '<br>')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'طريقة الطلب غير مدعومة' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: { user } } = await caller.auth.getUser()
  if (!user) return json({ error: 'غير مصرح' }, 401)
  const { data: me } = await admin.from('profiles').select('role,is_active').eq('id', user.id).single()
  if (!me?.is_active || !['admin', 'project_manager'].includes(me.role)) return json({ error: 'صلاحيات الإدارة مطلوبة' }, 403)

  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) return json({ error: 'خدمة الإيميل غير مفعّلة بعد (RESEND_API_KEY غير مضبوط).' }, 503)

  let b: { update_id?: string }
  try { b = await req.json() } catch { return json({ error: 'بيانات غير صالحة' }, 400) }
  if (!b.update_id) return json({ error: 'معرّف التحديث مطلوب' }, 400)

  const { data: u } = await admin.from('client_updates').select('*').eq('id', b.update_id).single()
  if (!u) return json({ error: 'التحديث غير موجود' }, 404)
  const { data: proj } = await admin.from('projects').select('title').eq('id', u.project_id).single()
  const { data: links } = await admin.from('project_clients').select('client_id').eq('project_id', u.project_id)
  const ids = (links ?? []).map((l) => l.client_id)
  if (!ids.length) return json({ error: 'لا يوجد عميل مرتبط بهذا المشروع.' }, 400)
  const { data: clients } = await admin.from('profiles').select('email,full_name').in('id', ids).eq('is_active', true).eq('role', 'client')
  const to = (clients ?? []).map((c) => c.email).filter(Boolean) as string[]
  if (!to.length) return json({ error: 'لا يوجد بريد إلكتروني لعميل نشط.' }, 400)

  const app = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:560px;margin:auto;line-height:1.8">
  <h2 style="margin:0 0 4px">تقرير اليوم — ${esc(proj?.title)}</h2>
  <div style="color:#666;margin-bottom:16px">${esc(u.date)}</div>
  <h3 style="margin:12px 0 4px">ما تم إنجازه</h3><p style="margin:0">${nl(u.summary)}</p>
  ${u.next_steps ? `<h3 style="margin:12px 0 4px">الخطوات القادمة</h3><p style="margin:0">${nl(u.next_steps)}</p>` : ''}
  ${u.photos?.length ? `<p style="margin-top:12px">${u.photos.length} صورة مرفقة في بوابتك.</p>` : ''}
  ${app ? `<p style="margin-top:20px"><a href="${esc(app)}/client" style="background:#d97706;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">فتح بوابة المشروع</a></p>` : ''}
  </div>`

  // One message per client so addresses are never exposed to each other.
  const from = Deno.env.get('MAIL_FROM') ?? 'onboarding@resend.dev'
  let sent = 0
  const failures: string[] = []
  for (const addr of to) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [addr], subject: `تقرير اليوم — ${proj?.title ?? ''}`, html }),
    })
    if (r.ok) sent++; else failures.push(`${addr}: ${(await r.text()).slice(0, 120)}`)
  }
  if (sent) await admin.from('client_updates').update({ emailed_at: new Date().toISOString() }).eq('id', u.id)
  return json({ sent, failed: failures.length, failures })
})
