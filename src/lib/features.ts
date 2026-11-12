import { BRAND, type PlanId } from "@/config/brand";

/** كل ميزة تُفتح في أي باقة. غيّر الباقة من src/config/brand.ts (plan) وليس من هنا.
 *  الميزات المقفولة تختفي من القوائم والتبويبات والمسارات. */
const PLANS: Record<PlanId, Record<FeatureKey, boolean>> = {
  basic: {
    quotes: false,
    changeOrders: false,
    subcontracts: false,
    boq: false,
    clientPortal: false,
    schedule: false,
    inventory: false,
    suppliers: false,
    documents: false,
    contact: false,
    finance: false,
    performance: false,
  },
  pro: {
    quotes: true,
    changeOrders: true,
    subcontracts: true,
    boq: false,
    clientPortal: true,
    schedule: true,
    inventory: true,
    suppliers: true,
    documents: true,
    contact: true,
    finance: false,
    performance: false,
  },
  full: {
    quotes: true,
    changeOrders: true,
    subcontracts: true,
    boq: true,
    clientPortal: true,
    schedule: true,
    inventory: true,
    suppliers: true,
    documents: true,
    contact: true,
    finance: true,
    performance: true,
  },
};

type FeatureKey =
  | "clientPortal" // بوابة العميل: حسابات العملاء، تقرير العميل، الدفعات، الطلبات والتقييم
  | "schedule" // الجدول الزمني (migration 009)
  | "inventory" // المخزون (migration 009)
  | "suppliers" // الموردون والدفعات (migration 009/011)
  | "documents" // المستندات + قبل/بعد (migration 010)
  | "contact" // زر جروب واتساب المشروع للعميل (migration 012)
  | "finance" // التقارير المالية + النسخة الاحتياطية (migration 009)
  | "performance" // لوحة أداء المهندسين (migration 011)
  | "quotes" // عروض الأسعار والفواتير + طباعة PDF (migration 013)
  | "changeOrders" // أوامر التغيير بموافقة العميل (migration 013، تتطلب بوابة العميل)
  | "subcontracts" // مقاولو الباطن ودفعاتهم (migration 013)
  | "boq"; // المقايسة مقابل المنفَّذ والفعلي (migration 013)

export const FEATURES: Record<FeatureKey, boolean> = PLANS[BRAND.plan];
