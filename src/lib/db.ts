import Dexie, { type Table } from 'dexie'
import type { SyncStatus } from './types'

export interface PendingReport {
  id?: number
  offlineId: string
  projectId: string
  engineerId: string
  completedWork: string
  remainingWork: string
  issues: string
  notes: string
  progressPct?: number
  photos: Blob[]
  date: string
  syncStatus: SyncStatus
  lastError?: string
  createdAt: string
}

export interface PendingExpense {
  id?: number
  offlineId: string
  projectId: string
  engineerId: string
  amount: number
  category: string
  description: string
  receipt?: Blob
  syncStatus: SyncStatus
  lastError?: string
  createdAt: string
}

class AppDB extends Dexie {
  pendingReports!: Table<PendingReport, number>
  pendingExpenses!: Table<PendingExpense, number>

  constructor() {
    super('tashtibet')
    this.version(1).stores({
      pendingReports: '++id, offlineId, syncStatus, engineerId',
      pendingExpenses: '++id, offlineId, syncStatus, engineerId',
    })
  }
}

export const localDB = new AppDB()
