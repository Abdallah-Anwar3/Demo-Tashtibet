import { cn } from '@/lib/utils'

export const BRAND_NAME = 'Elmostafa Group'
export const BRAND_TAGLINE = 'البساطة سر الجمال'

/** variant="full": الشعار الكامل (صفحات الدخول) — "mark": أيقونة البيت فقط (القائمة الجانبية).
 *  "onDark" يستخدم النسخة البيضاء للخلفيات الداكنة؛ غير ذلك يتبدّل تلقائياً مع الوضع الداكن. */
export function Logo({ variant = 'full', onDark = false, className }: { variant?: 'full' | 'mark'; onDark?: boolean; className?: string }) {
  const base = variant === 'full' ? '/logo' : '/mark'
  const alt = BRAND_NAME
  if (onDark) return <img src={`${base}-white.png`} alt={alt} className={cn('object-contain', className)} />
  return (
    <>
      <img src={`${base}.png`} alt={alt} className={cn('object-contain dark:hidden', className)} />
      <img src={`${base}-white.png`} alt={alt} className={cn('hidden object-contain dark:block', className)} />
    </>
  )
}
