// Supabase Edge Function: send-push  (deploy with --no-verify-jwt)
//
// Called by the DB trigger trg_notification_push with { id } of a new notification. It has no user JWT,
// so it is harmless to call: it only accepts a notification id (an unguessable uuid), sends that
// notification at most once (pushed_at claim) and returns no data.
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:you@example.com).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv)
    return json({ error: "VAPID keys are not configured" }, 503);

  let id = "";
  try {
    id = String((await req.json())?.id ?? "");
  } catch {
    /* empty body */
  }
  if (!UUID.test(id)) return json({ error: "bad id" }, 400);

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
    pub,
    priv,
  );
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Claim first: a second call for the same notification finds nothing to send.
  const { data: n } = await admin
    .from("notifications")
    .update({ pushed_at: new Date().toISOString() })
    .eq("id", id)
    .is("pushed_at", null)
    .select("id, user_id, title, body, link")
    .maybeSingle();
  if (!n) return json({ ok: true, skipped: true });

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", n.user_id);
  const payload = JSON.stringify({
    title: n.title,
    body: n.body ?? "",
    url: n.link ?? "/",
    tag: n.id,
  });

  let sent = 0;
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 86400, urgency: "high" },
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410)
          await admin.from("push_subscriptions").delete().eq("id", s.id); // device unsubscribed
      }
    }),
  );
  return json({ ok: true, sent });
});
