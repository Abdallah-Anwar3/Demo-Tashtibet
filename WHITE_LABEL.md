# تجهيز الموقع لشركة جديدة (White-label)

## الطريق السريع (سكربت)

```
node scripts/new-company.mjs --slug alnoor --name "Al Noor Group" --tagline "..." --theme "#0f3d3e" \
  --whatsapp 01012345678 --email owner@alnoor.com --ref <Project Ref الجديد> --apply
```

يطلّع مجلد `clients/alnoor/` فيه `brand.ts` و`all-migrations.sql` (كل المايجريشنز في ملف واحد، ومعدّل فيها رابط المشروع الجديد) و`secrets.txt` (مفاتيح VAPID جديدة) و`env.production` و`CHECKLIST.md`. المجلد مستبعد من git لأن فيه أسراراً.
**مهم:** مايجريشن 007 و008 فيها رابط مشروع Supabase مكتوب جوّاها، والسكربت بيبدّله بالـ `--ref`. لو لصقت المايجريشنز يدوياً بدل الملف المجمّع لازم تبدّل الرابط بنفسك، وإلا إشعارات الشركة هتروح لمشروع تاني.

الكود واحد لكل الشركات. لكل شركة: **مشروع Supabase خاص بها + مشروع Vercel خاص بها** (بياناتها لا تختلط بغيرها أبداً).

## أولاً: تغيير الهوية (ملفات فقط)

| ما تغيّره                                                                             | أين                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| اسم الشركة، الشعار اللفظي، الوصف، أرقام/روابط التواصل، لون التطبيق، إخفاء سطر المطوّر | `src/config/brand.ts`                                                                                                                                                                                                                                                                       |
| الشعار والأيقونات                                                                     | `public/` — أسهل طريقة: `python scripts/make_brand_assets.py logo-الشركة.png "#لون"` (يحتاج `pip install pillow`). أو استبدل الملفات يدوياً بنفس الأسماء: `logo.png` `logo-white.png` `mark.png` `mark-white.png` `favicon.png` `icons/icon-192.png` `icon-512.png` `icon-512-maskable.png` |
| الألوان                                                                               | `src/index.css` (متغيرات `--brand` و`--navy`… في `:root` وفي `.dark`) وخلّي `themeColor` في `brand.ts` نفس لون `--navy`                                                                                                                                                                     |
| تشغيل ميزات أو إيقافها                                                                | `src/lib/features.ts`                                                                                                                                                                                                                                                                       |

ثم `npm run build` وتأكد من الشاشة (الدخول، القائمة، الفوتر) ومن اسم التطبيق عند "تثبيت" الموقع على الموبايل.

## ثانياً: قاعدة بيانات جديدة لكل شركة (Supabase)

1. أنشئ **Project جديد** في Supabase (اسمه باسم الشركة).
2. شغّل ملفات `supabase/migrations/001` → `012` بالترتيب (SQL Editor).
3. انشر الـ Edge Functions الأربعة: `admin-users`, `send-client-update`, `send-weekly-report`, `send-push` — و`send-push` بدون JWT verification كما في الأصل.
4. ولّد مفاتيح VAPID جديدة للشركة: `node scripts/gen-vapid.mjs` — وضع الـ secrets في Edge Functions: `VAPID_PUBLIC_KEY` `VAPID_PRIVATE_KEY` `VAPID_SUBJECT` `RESEND_API_KEY` `MAIL_FROM` `APP_URL` (+ ما ورد في README).
5. أنشئ أول مستخدم Admin (من Auth ثم عدّل دوره في `profiles` إلى `admin`).
6. Auth → URL Configuration: ضع رابط موقع الشركة في Site URL وأضف `<الرابط>/reset-password` في Redirect URLs. وفعّل Leaked password protection.
7. (اختياري) نطاق إيميل الشركة في Resend.

## ثالثاً: Vercel

- Project جديد من نفس الكود (أو نسخة/Branch منه)، وفي Environment Variables: `VITE_SUPABASE_URL` و`VITE_SUPABASE_ANON_KEY` (من مشروع Supabase **الجديد**) و`VITE_VAPID_PUBLIC_KEY` (المفتاح العام الجديد). ثم Deploy.

## لماذا مشروع منفصل وليس قاعدة مشتركة؟

- عزل كامل: خطأ في صلاحية واحدة لا يمكن أن يكشف بيانات شركة لأخرى.
- نسخ احتياطي، حذف بيانات، وفواتير/حدود استخدام لكل عميل بشكل مستقل.
- الجداول الحالية بلا عمود `company_id`؛ جعلها Multi-tenant يعني تعديل كل جدول وكل سياسة RLS وكل دالة، وهو أخطر وأغلى.
- كل شركة تستطيع لاحقاً أن تطلب استضافة/نقل بياناتها بسهولة.
  (التكلفة: Supabase المجاني يسمح بمشروعين نشطين؛ ما فوق ذلك أو الاحتياط التلقائي يحتاج Pro لكل مشروع — يُحمَّل على العميل.)

## قائمة تسليم لكل شركة

- [ ] `brand.ts` + الشعار + الألوان
- [ ] Supabase جديد + migrations 001–012 + functions + secrets
- [ ] أول Admin + Auth URLs
- [ ] Vercel env + Deploy + تجربة دخول وإشعار

## تسريع التركيب بسكربت

على **نسخة جديدة** من مجلد المشروع:

```
node scripts/new-company.mjs --slug acme --name "Acme Group" --short Acme --tagline "الشعار" --color "#0b3d2e" --whatsapp 01012345678 [--facebook https://... --instagram https://... --tiktok https://...] [--hide-developer]
```

يعدّل `brand.ts`، ويجمّع المايجريشنز في ملف SQL واحد، ويولّد مفاتيح VAPID جديدة، ويكتب في `clients/<slug>/` الملفات: `all-migrations.sql` و`.env.local` و`SECRETS-DO-NOT-SHARE.txt` و`CHECKLIST.md`. لا يلمس Supabase ولا Vercel؛ باقي الخطوات يدوية حسب القائمة. لا ترفع مجلد `clients/` على Git (موجود في `.gitignore`).

## الباقات (أساسية / احترافية / متكاملة)

الباقة تُحدَّد بسطر واحد في `src/config/brand.ts`: `plan: 'basic' | 'pro' | 'full'`، وتفتح/تقفل الميزات من `src/lib/features.ts` (جدول `PLANS`). أو عند التركيب: `--plan pro` في `new-company.mjs`.

- **basic:** المشاريع، الحضور، التقارير، العُهد والمصروفات، المرتبات، الإشعارات.
- **pro:** + بوابة العميل (وحسابات العملاء)، الجدول الزمني، المستندات، المخزون، الموردون ومقاولو الباطن، عروض الأسعار والفواتير، أوامر التغيير، جروب واتساب.
- **full:** + التقارير المالية والنسخة الاحتياطية، لوحة أداء المهندسين، المقايسة مقابل المنفَّذ والفعلي.
- **كل الباقات:** تذكير المهندسين بالتقارير الناقصة (يعمل من قاعدة البيانات عبر cron في migration 013، وليس من الواجهة).
  للترقية: غيّر `plan` وأعد النشر على Vercel. الإقفال على مستوى الواجهة (القوائم والتبويبات والمسارات)؛ الجداول نفسها موجودة في قاعدة البيانات في كل الباقات.

> مهم: ملفا `007` و`008` يحتويان رابط مشروع Supabase الأصلي (للتقرير الأسبوعي وإشعارات الموبايل). عند التركيب لشركة جديدة مرّر `--ref` (Reference ID من Project Settings → General) ليستبدله السكربت في `all-migrations.sql`.
