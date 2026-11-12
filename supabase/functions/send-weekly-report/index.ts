// Supabase Edge Function: send-weekly-report
//
// Weekly summary e-mail for every active client (progress, this week's spend, published
// updates, next payment). Called by pg_cron (migration 007). It has no user JWT, so it is
// made harmless to call by anyone: each client gets at most ONE mail per calendar week
// (weekly_report_log), and it never returns any project data.
// Secrets: RESEND_API_KEY, MAIL_FROM, APP_URL.
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const money = (n: number) => `${Math.round(n).toLocaleString("en-US")} ج`;
const STAGE: Record<string, string> = {
  foundation: "تأسيس",
  masonry: "محارة",
  plumbing: "سباكة",
  electrical: "كهرباء",
  painting: "دهانات",
  final_finish: "تشطيب نهائي",
};

/** Monday of the current week in Cairo, as YYYY-MM-DD (the idempotency key). */
function weekStart(): string {
  const cairo = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo" }),
  );
  const d = new Date(
    Date.UTC(cairo.getFullYear(), cairo.getMonth(), cairo.getDate()),
  );
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Constant-time string compare. */
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Only pg_cron (which knows the shared secret) may trigger the run.
  const given = req.headers.get("x-cron-secret") ?? "";
  const { data: sec } = await admin
    .from("cron_secret")
    .select("value")
    .eq("id", true)
    .maybeSingle();
  if (!sec?.value || !given || !same(given, sec.value))
    return json({ error: "unauthorized" }, 401);

  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json({ error: "RESEND_API_KEY not set" }, 503);

  const from = Deno.env.get("MAIL_FROM") ?? "onboarding@resend.dev";
  const app = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
  const week = weekStart();
  const since = new Date(Date.now() - 7 * 864e5);
  const sinceDay = since.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const { data: clients } = await admin
    .from("profiles")
    .select("id,email,full_name")
    .eq("role", "client")
    .eq("is_active", true);
  let sent = 0,
    skipped = 0,
    failed = 0;

  for (const c of clients ?? []) {
    if (!c.email) {
      skipped++;
      continue;
    }
    // Claim the week first (primary key conflict = already sent); release it if sending fails.
    const claim = await admin
      .from("weekly_report_log")
      .insert({ client_id: c.id, week_start: week });
    if (claim.error) {
      skipped++;
      continue;
    }

    const { data: links } = await admin
      .from("project_clients")
      .select("project_id")
      .eq("client_id", c.id);
    const ids = (links ?? []).map((l) => l.project_id);
    const { data: projects } = ids.length
      ? await admin
          .from("projects")
          .select("id,title,stage,status,progress_pct,budget")
          .in("id", ids)
          .in("status", ["active", "paused"])
      : { data: [] as any[] };
    if (!projects?.length) {
      await admin
        .from("weekly_report_log")
        .delete()
        .eq("client_id", c.id)
        .eq("week_start", week);
      skipped++;
      continue;
    }

    let sections = "";
    for (const p of projects) {
      const [{ data: ex }, { data: ups }, { data: pay }] = await Promise.all([
        admin
          .from("expenses")
          .select("amount,created_at")
          .eq("project_id", p.id)
          .eq("status", "approved"),
        admin
          .from("client_updates")
          .select("date,summary")
          .eq("project_id", p.id)
          .gte("date", sinceDay)
          .order("date"),
        admin
          .from("project_payments")
          .select("title,amount,due_date")
          .eq("project_id", p.id)
          .eq("status", "pending")
          .order("due_date")
          .limit(1),
      ]);
      const spent = (ex ?? []).reduce((s, e) => s + Number(e.amount), 0);
      const week_ = (ex ?? [])
        .filter((e) => new Date(e.created_at) >= since)
        .reduce((s, e) => s + Number(e.amount), 0);
      const next = pay?.[0];
      sections += `<div style="border:1px solid #e5e5e5;border-radius:10px;padding:14px;margin:14px 0">
        <h3 style="margin:0 0 6px">${esc(p.title)}</h3>
        <div>المرحلة: <b>${esc(STAGE[p.stage] ?? p.stage)}</b> · نسبة الإنجاز: <b>${p.progress_pct}%</b></div>
        <div>المصروف المعتمد: <b>${money(spent)}</b> من ${money(Number(p.budget))} <span style="color:#666">(هذا الأسبوع ${money(week_)})</span></div>
        ${next ? `<div>الدفعة القادمة: ${esc(next.title)} — <b>${money(Number(next.amount))}</b> بتاريخ ${esc(next.due_date)}${next.due_date < today ? ' <span style="color:#b91c1c">(متأخرة)</span>' : ""}</div>` : ""}
        <div style="margin-top:8px"><b>تقارير الأسبوع (${ups?.length ?? 0}):</b>${(ups ?? []).length ? '<ul style="margin:4px 0">' + (ups ?? []).map((u) => `<li>${esc(u.date)}: ${esc(String(u.summary).slice(0, 220))}</li>`).join("") + "</ul>" : " لا يوجد."}</div>
      </div>`;
    }

    const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:600px;margin:auto;line-height:1.8">
      <h2 style="margin:0">الملخص الأسبوعي</h2><div style="color:#666">أهلاً ${esc(c.full_name)}</div>
      ${sections}
      ${app ? `<p><a href="${esc(app)}/client" style="background:#d97706;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">فتح بوابة المشروع</a></p>` : ""}
    </div>`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [c.email],
        subject: "الملخص الأسبوعي لمشروعك",
        html,
      }),
    });
    if (r.ok) sent++;
    else {
      failed++;
      await admin
        .from("weekly_report_log")
        .delete()
        .eq("client_id", c.id)
        .eq("week_start", week);
    }
  }
  return json({ week, sent, skipped, failed });
});
