import { BRAND } from '@/config/brand'
import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  Building2, CalendarCheck, ClipboardList, FileText, HardHat, LayoutDashboard, LogOut, Menu, MapPin,
  Moon, Receipt, ScrollText, Sun, Users, Wallet, Wifi, WifiOff, X, Banknote, KeyRound, Newspaper, MessageSquare, Truck, PieChart, Gauge, type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { NotificationBell } from '@/components/Notifications'
import { ChangePasswordModal } from '@/components/ChangePassword'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { ROLE_LABEL } from '@/lib/labels'
import { cn } from '@/lib/utils'
import Footer from '@/components/Footer'
import DemoBanner from '@/components/DemoBanner'
import { Logo } from '@/components/Logo'
import { FEATURES } from '@/lib/features'

const ADMIN_NAV: { to: string; end?: boolean; label: string; icon: LucideIcon; adminOnly?: boolean }[] = [
  { to: '/admin', end: true, label: 'لوحة التحكم', icon: LayoutDashboard },
  { to: '/admin/projects', label: 'المشاريع والمواقع', icon: Building2 },
  { to: '/admin/team', label: 'الفريق والحسابات', icon: Users, adminOnly: true },
  { to: '/admin/expenses', label: 'المصروفات والعهد', icon: Receipt },
  { to: '/admin/payroll', label: 'المرتبات', icon: Banknote, adminOnly: true },
  { to: '/admin/reports', label: 'التقارير اليومية', icon: ClipboardList },
  { to: '/admin/attendance', label: 'الحضور والانصراف', icon: CalendarCheck },
  ...(FEATURES.quotes ? [{ to: '/admin/quotes', label: 'عروض الأسعار والفواتير', icon: FileText }] : []),
  ...(FEATURES.suppliers ? [{ to: '/admin/suppliers', label: 'الموردون', icon: Truck }] : []),
  ...(FEATURES.finance ? [{ to: '/admin/finance', label: 'التقارير المالية', icon: PieChart }] : []),
  ...(FEATURES.performance ? [{ to: '/admin/performance', label: 'أداء المهندسين', icon: Gauge }] : []),
  { to: '/admin/audit', label: 'سجل التعديلات', icon: ScrollText, adminOnly: true },
]

const ENG_NAV = [
  { to: '/app', end: true, label: 'الرئيسية', icon: HardHat },
  { to: '/app/attendance', label: 'الحضور', icon: MapPin },
  { to: '/app/report', label: 'التقرير', icon: FileText },
  { to: '/app/expenses', label: 'المصروفات', icon: Wallet },
]

const CLIENT_NAV = [
  { to: '/client', end: true, label: 'المشروع', icon: Building2 },
  { to: '/client/updates', label: 'التقارير', icon: Newspaper },
  { to: '/client/payments', label: 'الدفعات', icon: Banknote },
  { to: '/client/requests', label: 'طلباتي', icon: MessageSquare },
]

function useTheme() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('theme') === 'dark' } catch { return false }
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try { localStorage.setItem('theme', dark ? 'dark' : 'light') } catch { /* private mode */ }
  }, [dark])
  return { dark, toggle: () => setDark((d) => !d) }
}

export function SyncPill() {
  const { online, pending, sync } = useOfflineSync()
  return (
    <button onClick={() => void sync()} title="مزامنة الآن"
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold',
        online ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad')}>
      {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      {online ? 'متصل' : 'غير متصل'}
      {pending > 0 && <span className="rounded-full bg-brand px-1.5 text-white">{pending} بانتظار الرفع</span>}
    </button>
  )
}

/** One shell for both roles: sidebar for managers (desktop/tablet), bottom nav for engineers (phone). */
export function Shell() {
  const { profile, isAdmin, isManager, signOut } = useAuth()
  const { dark, toggle } = useTheme()
  const [open, setOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const isClient = profile?.role === 'client'
  const nav = isManager ? ADMIN_NAV.filter((n) => isAdmin || !n.adminOnly) : isClient ? CLIENT_NAV : ENG_NAV

  const Links = ({ vertical }: { vertical: boolean }) => (
    <>
      {nav.map(({ to, label, icon: Icon, ...rest }) => (
        <NavLink key={to} to={to} end={'end' in rest ? rest.end : false} onClick={() => setOpen(false)}
          className={({ isActive }) => cn(
            vertical
              ? 'flex items-center gap-3 border-e-[3px] px-5 py-2.5 text-sm font-semibold transition'
              : 'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-bold transition',
            vertical
              ? (isActive ? 'border-brand bg-brand/10 text-brand' : 'border-transparent text-white/50 hover:bg-white/5 hover:text-white/90')
              : (isActive ? 'text-brand' : 'text-muted'))}>
          <Icon className={vertical ? 'h-[18px] w-[18px]' : 'h-5 w-5'} />
          {label}
        </NavLink>
      ))}
    </>
  )

  const sidebar = (
    <aside className="flex h-full w-64 flex-col bg-navy text-white">
      <div className="border-b border-white/10 p-5">
        <div className="flex items-center gap-3">
          <Logo variant="mark" onDark className="h-9 w-11 shrink-0" />
          <div className="leading-tight"><div className="text-[15px] font-black">{BRAND.name}</div><div className="text-[11px] text-white/60">{BRAND.tagline}</div></div>
        </div>
        <div className="mt-3 inline-block rounded-full border border-brand/30 bg-brand/20 px-2.5 py-0.5 text-[11px] font-bold text-brand">
          {profile && ROLE_LABEL[profile.role]}
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-3"><Links vertical /></nav>
      <div className="border-t border-white/10 p-4">
        <div className="mb-3 truncate text-sm font-bold">{profile?.full_name}</div>
        <div className="flex gap-2">
          <button onClick={() => void signOut()} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-white/10 py-2 text-xs font-bold hover:bg-white/15">
            <LogOut className="h-4 w-4" /> تسجيل الخروج
          </button>
          <button onClick={() => setPwOpen(true)} aria-label="تغيير كلمة المرور" title="تغيير كلمة المرور" className="rounded-lg bg-white/10 p-2 hover:bg-white/15">
            <KeyRound className="h-4 w-4" />
          </button>
          <button onClick={toggle} aria-label="تبديل المظهر" className="rounded-lg bg-white/10 p-2 hover:bg-white/15">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </aside>
  )

  return (
    <div className="flex h-full">
      {isManager && <div className="hidden md:block">{sidebar}</div>}
      {isManager && open && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="absolute inset-y-0 start-0" onClick={(e) => e.stopPropagation()}>{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-7">
          {isManager && (
            <button className="rounded-lg p-1.5 hover:bg-raised md:hidden" onClick={() => setOpen((o) => !o)} aria-label="القائمة">
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          )}
          <div className="flex-1 font-extrabold">{isManager ? 'نظام إدارة المواقع' : isClient ? 'بوابة متابعة المشروع' : profile?.full_name}</div>
          {!isClient && <SyncPill />}
          {(isManager || isClient) && <NotificationBell />}
          {!isManager && (
            <>
              <button onClick={() => setPwOpen(true)} aria-label="تغيير كلمة المرور" className="rounded-lg p-2 text-muted hover:bg-raised">
                <KeyRound className="h-4 w-4" />
              </button>
              <button onClick={toggle} aria-label="تبديل المظهر" className="rounded-lg p-2 text-muted hover:bg-raised">
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button onClick={() => void signOut()} aria-label="تسجيل الخروج" className="rounded-lg p-2 text-muted hover:bg-raised">
                <LogOut className="h-4 w-4" />
              </button>
            </>
          )}
        </header>

        <DemoBanner />
        <main className={cn('flex-1 overflow-y-auto p-4 md:p-7', !isManager && 'pb-24')}>
          <Outlet />
          <Footer />
        </main>

        <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />

        {!isManager && (
          <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-card pb-[env(safe-area-inset-bottom)]">
            <Links vertical={false} />
          </nav>
        )}
      </div>
    </div>
  )
}
