import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface EngineerPerf {
  engineer_id: string; full_name: string; active_projects: number; field_days: number; verified_days: number
  report_days: number; missing_reports: number; avg_hours: number
  expenses_approved: number; expenses_pending: number; expenses_rejected: number
}

export const useEngineerPerformance = (from: string, to: string) =>
  useQuery({
    queryKey: ['engineer-performance', from, to],
    enabled: !!from && !!to && from <= to,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('engineer_performance', { p_from: from, p_to: to })
      if (error) throw new Error(error.message)
      return ((data ?? []) as EngineerPerf[]).map((r) => ({ ...r, avg_hours: Number(r.avg_hours), expenses_approved: Number(r.expenses_approved) }))
    },
  })
