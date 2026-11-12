export type Role = 'admin' | 'project_manager' | 'site_engineer' | 'client'
export type ProjectStage = 'foundation' | 'masonry' | 'plumbing' | 'electrical' | 'painting' | 'final_finish'
export type ProjectStatus = 'active' | 'paused' | 'completed' | 'cancelled'
export type ExpenseCategory = 'labor_wages' | 'subcontractor' | 'materials' | 'transportation'
export type ExpenseStatus = 'approved' | 'pending_review' | 'rejected'
export type SyncStatus = 'pending' | 'synced' | 'failed'

export interface Profile {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  role: Role
  base_salary: number
  site_allowance_rate: number
  is_active: boolean
  created_at: string
}

export interface Project {
  id: string
  title: string
  client_name: string
  address: string | null
  location_lat: number | null
  location_lng: number | null
  geofence_radius_m: number
  status: ProjectStatus
  stage: ProjectStage
  assigned_engineer_ids: string[]
  budget: number
  progress_pct: number
  budget_alert_level: number
  start_date: string | null
  delivery_date: string | null
  created_at: string
}

export interface Attendance {
  id: string
  engineer_id: string
  project_id: string
  check_in_time: string
  check_out_time: string | null
  check_in_lat: number | null
  check_in_lng: number | null
  is_within_geofence: boolean
  is_verified: boolean
  date: string
}

export interface DailyReport {
  id: string
  project_id: string
  engineer_id: string
  completed_work: string | null
  remaining_work: string | null
  issues: string | null
  notes: string | null
  progress_pct: number | null
  /** Storage object paths inside the private `site-reports` bucket (not URLs). */
  photos_urls: string[]
  date: string
  created_at: string
}

export interface CustodyWallet {
  id: string
  engineer_id: string
  total_disbursed: number
  current_balance: number
  last_settled_at: string | null
}

export interface Expense {
  id: string
  custody_id: string
  project_id: string | null
  engineer_id: string
  amount: number
  category: ExpenseCategory
  description: string | null
  /** Storage object path inside the private `receipts` bucket. */
  receipt_url: string | null
  status: ExpenseStatus
  created_at: string
}

export interface PayrollRecord {
  id: string
  engineer_id: string
  month: number
  year: number
  base_salary: number
  allowances: number
  bonuses: number
  advances: number
  deductions: number
  net_salary: number
  field_days: number
  status: 'draft' | 'approved' | 'paid'
}

export interface AppNotification {
  id: string
  user_id: string
  kind: 'expense' | 'report' | 'budget' | string
  title: string
  body: string | null
  link: string | null
  is_read: boolean
  created_at: string
}

export interface AuditEntry {
  id: number
  actor_id: string | null
  action: 'insert' | 'update' | 'delete' | 'create' | string
  entity: string
  entity_id: string | null
  details: Record<string, unknown> | null
  created_at: string
}

export interface StageHistory {
  id: string
  project_id: string
  stage: ProjectStage
  changed_by: string | null
  changed_at: string
}

/** Curated per-project numbers returned by the client_dashboard() RPC. */
export interface ClientProject {
  id: string
  title: string
  address: string | null
  status: ProjectStatus
  stage: ProjectStage
  progress_pct: number
  start_date: string | null
  delivery_date: string | null
  budget: number
  spent: number
  by_category: { category: ExpenseCategory; total: number }[]
  stages: { stage: ProjectStage; changed_at: string }[]
  pay_total: number
  pay_paid: number
  next_due: { title: string; amount: number; due_date: string } | null
}

/** The daily update a manager publishes for the client. */
export interface ClientUpdate {
  id: string
  project_id: string
  date: string
  summary: string
  next_steps: string | null
  photos: string[]
  published_by: string | null
  published_at: string
  emailed_at: string | null
}

export interface ProjectPayment {
  id: string
  project_id: string
  title: string
  amount: number
  due_date: string
  status: 'pending' | 'paid'
  paid_at: string | null
  note: string | null
  created_at: string
}

export type RequestKind = 'note' | 'complaint' | 'change'
export type RequestStatus = 'open' | 'in_progress' | 'resolved'

export interface ClientRequest {
  id: string
  project_id: string
  client_id: string
  kind: RequestKind
  subject: string
  body: string
  status: RequestStatus
  created_at: string
  updated_at: string
}

export interface RequestMessage {
  id: string
  request_id: string
  author_id: string
  body: string
  created_at: string
}

export interface StageRating {
  id: string
  project_id: string
  stage: ProjectStage
  client_id: string
  rating: number
  comment: string | null
  created_at: string
}
