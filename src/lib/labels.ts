import type { ExpenseCategory, ExpenseStatus, ProjectStage, ProjectStatus, Role } from './types'

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'مدير النظام',
  project_manager: 'مدير مشاريع',
  site_engineer: 'مهندس موقع',
  client: 'عميل',
}

export const STAGES: ProjectStage[] = ['foundation', 'masonry', 'plumbing', 'electrical', 'painting', 'final_finish']
export const STAGE_LABEL: Record<ProjectStage, string> = {
  foundation: 'تأسيس',
  masonry: 'محارة',
  plumbing: 'سباكة',
  electrical: 'كهرباء',
  painting: 'دهانات',
  final_finish: 'تشطيب نهائي',
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'نشط',
  paused: 'متوقف',
  completed: 'مكتمل',
  cancelled: 'ملغي',
}

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  labor_wages: 'يوميات عمالة',
  subcontractor: 'مقاولو باطن',
  materials: 'شراء خامات ونواقص',
  transportation: 'نقل ونثريات',
}

export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  approved: 'معتمد',
  pending_review: 'قيد المراجعة',
  rejected: 'مرفوض',
}

export const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

export const REQUEST_KIND_LABEL = { note: 'ملاحظة', complaint: 'شكوى', change: 'طلب تعديل' } as const
export const REQUEST_STATUS_LABEL = { open: 'جديد', in_progress: 'قيد المعالجة', resolved: 'تم الحل' } as const
