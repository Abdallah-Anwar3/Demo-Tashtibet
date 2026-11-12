#!/usr/bin/env node
// تجهيز نسخة المشروع لشركة جديدة بأمر واحد.
//   node scripts/new-company.mjs --slug acme --name "Acme Group" --short "Acme" --tagline "شعارنا" \
//        --color "#0b3d2e" --whatsapp 01012345678 [--facebook URL --instagram URL --tiktok URL] [--ref SUPABASE_PROJECT_REF] [--plan basic|pro|full] [--hide-developer]
// شغّله على نسخة جديدة من مجلد المشروع (لا تشغّله على نسخة شركة شغّالة).
// يعمل: 1) يعدّل src/config/brand.ts  2) يجمّع المايجريشنز في ملف SQL واحد
//       3) يولّد مفاتيح VAPID جديدة  4) يكتب .env.local ونص الـ secrets وقائمة الخطوات في clients/<slug>/
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith("--")) continue;
  const k = argv[i].slice(2);
  const next = argv[i + 1];
  if (!next || next.startsWith("--")) args[k] = true;
  else {
    args[k] = next;
    i++;
  }
}
const need = (k) => {
  if (!args[k] || args[k] === true) {
    console.error(`ناقص: --${k}`);
    process.exit(1);
  }
  return String(args[k]);
};

const slug = need("slug");
if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) {
  console.error("--slug: حروف إنجليزية صغيرة وأرقام وشرطة فقط");
  process.exit(1);
}
const name = need("name");
const q = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const color = args.color ? String(args.color) : null;
if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
  console.error("--color لازم يكون مثل #16213e");
  process.exit(1);
}
if (args.whatsapp && !/^[0-9+\s-]{8,16}$/.test(String(args.whatsapp))) {
  console.error("--whatsapp رقم غير صالح");
  process.exit(1);
}
for (const k of ["facebook", "instagram", "tiktok"]) {
  if (args[k] && !/^https:\/\//.test(String(args[k]))) {
    console.error(`--${k} لازم يبدأ بـ https://`);
    process.exit(1);
  }
}

/* 1) brand.ts — المفاتيح العليا مسافتان، والمتداخلة أربع */
const brandPath = join(root, "src/config/brand.ts");
let b = readFileSync(brandPath, "utf8");
const top = (key, val) => {
  const re = new RegExp(`^(  ${key}: ')(?:[^'\\\\]|\\\\.)*(',.*)$`, "m");
  if (!re.test(b)) {
    console.error(`لم أجد ${key} في brand.ts`);
    process.exit(1);
  }
  b = b.replace(re, (_m, a, c) => a + q(val) + c);
};
const nested = (key, val) => {
  const re = new RegExp(`^(    ${key}: ')(?:[^'\\\\]|\\\\.)*(',.*)$`, "m"); // أول تطابق = contact
  if (!re.test(b)) {
    console.error(`لم أجد ${key} في brand.ts`);
    process.exit(1);
  }
  b = b.replace(re, (_m, a, c) => a + q(val) + c);
};
top("name", name);
if (args.plan) {
  if (!["basic", "pro", "full"].includes(String(args.plan))) {
    console.error("--plan: basic أو pro أو full");
    process.exit(1);
  }
  const re = /^(  plan: ')[a-z]+(' as PlanId,)$/m;
  if (!re.test(b)) {
    console.error("لم أجد plan في brand.ts");
    process.exit(1);
  }
  b = b.replace(re, (_m, a, c) => a + String(args.plan) + c);
}
top("shortName", String(args.short || name.split(/\s+/)[0]));
if (args.tagline) top("tagline", String(args.tagline));
if (args.summary) top("summary", String(args.summary));
if (color) top("themeColor", color);
nested("whatsapp", args.whatsapp ? String(args.whatsapp) : "");
for (const k of ["facebook", "instagram", "tiktok"])
  nested(k, args[k] ? String(args[k]) : "");
if (args["hide-developer"])
  b = b.replace("showDeveloper: true", "showDeveloper: false");
writeFileSync(brandPath, b);

/* 2) كل المايجريشنز في ملف واحد */
const out = join(root, "clients", slug);
mkdirSync(out, { recursive: true });
const migDir = join(root, "supabase/migrations");
const files = readdirSync(migDir)
  .filter((f) => /^\d+.*\.sql$/.test(f))
  .sort();
// 007 و008 فيهما رابط مشروع Supabase الأصلي: نستبدله بمرجع مشروع الشركة الجديدة (Project Settings → General → Reference ID)
const ref = args.ref ? String(args.ref) : "YOUR_PROJECT_REF";
if (!/^[a-z0-9_]{6,40}$/i.test(ref)) {
  console.error("--ref غير صالح");
  process.exit(1);
}
const bundle = files
  .map((f) => `-- ===== ${f} =====\n${readFileSync(join(migDir, f), "utf8")}`)
  .join("\n\n")
  .replaceAll("rragdyhfitbckoznomxm", ref);
writeFileSync(join(out, "all-migrations.sql"), bundle);
if (ref === "YOUR_PROJECT_REF")
  console.log(
    "تنبيه: لم تمرّر --ref، فاستبدل YOUR_PROJECT_REF في all-migrations.sql قبل تشغيله وإلا ستتصل المهام المجدولة بمشروع خاطئ.",
  );

/* 3) VAPID */
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = privateKey.export({ format: "jwk" });
const pub = Buffer.concat([
  Buffer.from([4]),
  Buffer.from(jwk.x, "base64url"),
  Buffer.from(jwk.y, "base64url"),
]).toString("base64url");

/* 4) ملفات الشركة */
writeFileSync(
  join(out, ".env.local"),
  `# انسخه إلى جذر المشروع باسم .env.local وأضف قيم Supabase الخاصة بهذه الشركة\nVITE_SUPABASE_URL=\nVITE_SUPABASE_ANON_KEY=\nVITE_VAPID_PUBLIC_KEY=${pub}\n`,
);
writeFileSync(
  join(out, "SECRETS-DO-NOT-SHARE.txt"),
  `# Supabase → Edge Functions → Secrets (لهذه الشركة فقط)\nVAPID_PUBLIC_KEY=${pub}\nVAPID_PRIVATE_KEY=${jwk.d}\nVAPID_SUBJECT=mailto:EMAIL-OF-COMPANY\nRESEND_API_KEY=\nMAIL_FROM=${name} <noreply@COMPANY-DOMAIN>\nAPP_URL=https://COMPANY-SITE-URL\n`,
);
writeFileSync(
  join(out, "CHECKLIST.md"),
  `# تركيب ${name} (${slug})\n\n- [x] الهوية في src/config/brand.ts (تم بالسكربت)\n- [ ] استبدل الشعار: python scripts/make_brand_assets.py logo.png "${color ?? "#16213e"}"\n- [ ] الألوان في src/index.css لو لازم\n- [ ] مشروع Supabase جديد → SQL Editor → الصق all-migrations.sql وشغّله\n- [ ] انشر الـ Edge Functions: admin-users, send-client-update, send-weekly-report, send-push (بدون JWT verification لـ send-push)\n- [ ] ضع الـ secrets من SECRETS-DO-NOT-SHARE.txt في Supabase\n- [ ] أنشئ أول مستخدم وغيّر دوره في profiles إلى admin\n- [ ] Auth → URL Configuration: Site URL + <الرابط>/reset-password، وفعّل Leaked password protection\n- [ ] Vercel: مشروع جديد، متغيرات VITE_* من .env.local، ثم Deploy\n- [ ] جرّب: دخول، إنشاء مشروع، تقرير بصور، إشعار، حساب عميل وزر جروب الواتساب\n\nالسكربت لم يشغّل أي شيء على Supabase أو Vercel — هذه خطوات يدوية.\n`,
);

console.log(
  `تم تجهيز "${name}".\n- brand.ts اتعدّل\n- clients/${slug}/ فيه: all-migrations.sql · .env.local · SECRETS-DO-NOT-SHARE.txt · CHECKLIST.md\nمجلد clients/ في .gitignore فلن يُرفع على Git.`,
);
void existsSync;
