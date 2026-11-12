const nf = new Intl.NumberFormat('ar-EG-u-nu-latn', { maximumFractionDigits: 2 })

export const money = (n: number | null | undefined) => `${nf.format(Number(n ?? 0))} ج`
export const num = (n: number | null | undefined) => nf.format(Number(n ?? 0))

export const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' })

export const fmtTime = (d: string | Date) =>
  new Date(d).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' })

export const fmtDateTime = (d: string | Date) => `${fmtDate(d)} ${fmtTime(d)}`

/** Cairo-local YYYY-MM-DD (the DB stores attendance dates in Cairo time). */
export const todayISO = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date())

export function durationHM(from: string, to?: string | null) {
  const ms = (to ? new Date(to) : new Date()).getTime() - new Date(from).getTime()
  const m = Math.max(0, Math.round(ms / 60000))
  return `${Math.floor(m / 60)} س ${String(m % 60).padStart(2, '0')} د`
}

/** CSV with BOM so Excel opens Arabic text correctly. */
export function downloadCSV(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const csv = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
