/** Demo mode is switched on by VITE_DEMO=1 (set only on the demo deployment). */
export const IS_DEMO = import.meta.env.VITE_DEMO === '1'

/** Fake accounts created by demo/02-demo-seed.sql. Shown on the login page of the demo only. */
export const DEMO_PASSWORD = 'Demo@2026!'
export const DEMO_ACCOUNTS = [
  { kind: 'manager', label: 'مدير النظام', email: 'admin@demo.test' },
  { kind: 'manager', label: 'مدير مشاريع', email: 'manager@demo.test' },
  { kind: 'engineer', label: 'مهندس موقع', email: 'eng1@demo.test' },
  { kind: 'client', label: 'عميل', email: 'client@demo.test' },
] as const
