// Supabase Edge Function: admin-users
//
// Creating / editing auth accounts needs the SERVICE ROLE key, which must never ship
// to the browser. The admin UI calls this function; it verifies the caller is an
// active admin, then acts. SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY are injected
// automatically by Supabase.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const ROLES = ["admin", "project_manager", "site_engineer", "client"];
const num = (v: unknown) =>
  v === undefined || v === null || v === "" ? undefined : Number(v);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")
    return json({ error: "طريقة الطلب غير مدعومة" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: {
      headers: { Authorization: req.headers.get("Authorization") ?? "" },
    },
  });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // 1. Only an active admin may call this function
  const {
    data: { user },
  } = await caller.auth.getUser();
  if (!user) return json({ error: "غير مصرح" }, 401);
  const { data: me } = await admin
    .from("profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin" || !me.is_active)
    return json({ error: "صلاحيات المدير مطلوبة" }, 403);

  // 1b. Never change accounts on a demo database (the demo_marker table exists only there).
  // On a normal project the table is missing, the query errors and we carry on.
  const { data: demoRow } = await admin
    .from("demo_marker")
    .select("id")
    .limit(1);
  if (demoRow?.length)
    return json({ error: "غير متاح في النسخة التجريبية" }, 403);

  let b: Record<string, any>;
  try {
    b = await req.json();
  } catch {
    return json({ error: "بيانات غير صالحة" }, 400);
  }

  const audit = (
    action: string,
    entityId: string,
    details: Record<string, unknown>,
  ) =>
    admin
      .from("audit_log")
      .insert({
        actor_id: user.id,
        action,
        entity: "profiles",
        entity_id: entityId,
        details,
      });

  // True when `exceptId` is not the only remaining active admin
  const otherAdminExists = async (exceptId: string) => {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true)
      .neq("id", exceptId);
    return (count ?? 0) > 0;
  };

  async function syncProjects(engineerId: string, projectIds: string[]) {
    const { data: all } = await admin
      .from("projects")
      .select("id,assigned_engineer_ids");
    for (const p of all ?? []) {
      const current: string[] = p.assigned_engineer_ids ?? [];
      const has = current.includes(engineerId);
      const want = projectIds.includes(p.id);
      if (has === want) continue;
      await admin
        .from("projects")
        .update({
          assigned_engineer_ids: want
            ? [...current, engineerId]
            : current.filter((x) => x !== engineerId),
        })
        .eq("id", p.id);
    }
  }

  // Client accounts are linked to projects through project_clients (never through assigned_engineer_ids)
  async function syncClientProjects(clientId: string, projectIds: string[]) {
    await admin.from("project_clients").delete().eq("client_id", clientId);
    if (projectIds.length) {
      await admin
        .from("project_clients")
        .insert(
          projectIds.map((project_id) => ({ project_id, client_id: clientId })),
        );
    }
  }

  switch (b.action) {
    case "create": {
      const email = String(b.email ?? "")
        .trim()
        .toLowerCase();
      if (!email || !b.password || String(b.password).length < 8)
        return json(
          { error: "البريد مطلوب وكلمة المرور 8 أحرف على الأقل" },
          400,
        );
      if (!b.full_name?.trim()) return json({ error: "الاسم مطلوب" }, 400);
      const role = b.role ?? "site_engineer";
      if (!ROLES.includes(role)) return json({ error: "دور غير صالح" }, 400);

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: b.password,
        email_confirm: true,
        user_metadata: { full_name: b.full_name },
      });
      if (error) return json({ error: error.message }, 400);
      const id = data.user.id;

      const { error: pErr } = await admin.from("profiles").insert({
        id,
        email,
        full_name: b.full_name.trim(),
        phone: b.phone || null,
        role,
        base_salary: num(b.base_salary) ?? 0,
        site_allowance_rate: num(b.site_allowance_rate) ?? 0,
        is_active: true,
      });
      if (pErr) {
        await admin.auth.admin.deleteUser(id); // never leave a login without a profile
        return json({ error: pErr.message }, 400);
      }
      if (role === "site_engineer") {
        const opening = num(b.opening_custody) ?? 0;
        await admin
          .from("custody_wallets")
          .upsert(
            {
              engineer_id: id,
              total_disbursed: opening,
              current_balance: opening,
            },
            { onConflict: "engineer_id" },
          );
        await syncProjects(id, b.project_ids ?? []);
      }
      if (role === "client") await syncClientProjects(id, b.project_ids ?? []);
      await audit("create", id, { email, role, full_name: b.full_name });
      return json({ id });
    }

    case "update": {
      if (!b.id) return json({ error: "معرّف المستخدم مطلوب" }, 400);
      if (b.role !== undefined && !ROLES.includes(b.role))
        return json({ error: "دور غير صالح" }, 400);
      if (b.password && String(b.password).length < 8)
        return json({ error: "كلمة المرور 8 أحرف على الأقل" }, 400);

      const { data: target } = await admin
        .from("profiles")
        .select("role,is_active")
        .eq("id", b.id)
        .single();
      if (!target) return json({ error: "المستخدم غير موجود" }, 404);

      // Protect the last active admin (and yourself) from demotion or suspension
      const demoting =
        target.role === "admin" && b.role !== undefined && b.role !== "admin";
      const suspending = target.role === "admin" && b.is_active === false;
      if ((demoting || suspending) && !(await otherAdminExists(b.id))) {
        return json({ error: "لا يمكن تعديل آخر مدير نظام نشط" }, 400);
      }
      if (b.id === user.id && (demoting || suspending))
        return json({ error: "لا يمكنك تغيير دورك أو إيقاف حسابك" }, 400);

      const authPatch: Record<string, unknown> = {};
      if (b.email) authPatch.email = String(b.email).trim().toLowerCase();
      if (b.password) authPatch.password = b.password;
      if (b.is_active !== undefined)
        authPatch.ban_duration = b.is_active ? "none" : "876000h"; // suspended = cannot sign in
      if (Object.keys(authPatch).length) {
        const { error } = await admin.auth.admin.updateUserById(
          b.id,
          authPatch,
        );
        if (error) return json({ error: error.message }, 400);
      }

      const patch: Record<string, unknown> = {};
      if (b.full_name !== undefined) patch.full_name = b.full_name;
      if (b.phone !== undefined) patch.phone = b.phone || null;
      if (b.role !== undefined) patch.role = b.role;
      if (b.is_active !== undefined) patch.is_active = b.is_active;
      if (authPatch.email) patch.email = authPatch.email;
      const sal = num(b.base_salary),
        rate = num(b.site_allowance_rate);
      if (sal !== undefined) patch.base_salary = sal;
      if (rate !== undefined) patch.site_allowance_rate = rate;
      if (Object.keys(patch).length) {
        const { error } = await admin
          .from("profiles")
          .update(patch)
          .eq("id", b.id);
        if (error) return json({ error: error.message }, 400);
      }
      const role = (b.role ?? target.role) as string;
      if (role === "client") {
        if (target.role !== "client") await syncProjects(b.id, []); // was an engineer: drop site assignments
        if (Array.isArray(b.project_ids) || target.role !== "client")
          await syncClientProjects(b.id, b.project_ids ?? []);
      } else {
        if (target.role === "client") await syncClientProjects(b.id, []);
        if (Array.isArray(b.project_ids))
          await syncProjects(b.id, b.project_ids);
      }

      await audit("update", b.id, { ...patch, password_changed: !!b.password });
      return json({ ok: true });
    }

    case "delete": {
      if (b.id === user.id) return json({ error: "لا يمكنك حذف حسابك" }, 400);
      const { data: target } = await admin
        .from("profiles")
        .select("role,full_name")
        .eq("id", b.id)
        .single();
      if (target?.role === "admin" && !(await otherAdminExists(b.id)))
        return json({ error: "لا يمكن حذف آخر مدير نظام" }, 400);
      const { error } = await admin.auth.admin.deleteUser(b.id);
      if (error) return json({ error: error.message }, 400);
      await audit("delete", b.id, {
        full_name: target?.full_name,
        role: target?.role,
      });
      return json({ ok: true });
    }

    default:
      return json({ error: "إجراء غير معروف" }, 400);
  }
});
