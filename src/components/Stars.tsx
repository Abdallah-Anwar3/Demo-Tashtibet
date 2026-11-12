import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 1-5 star picker (interactive) or read-only display. */
export function Stars({ value, onChange, size = 'md' }: { value: number; onChange?: (n: number) => void; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-3.5 w-3.5' : 'h-6 w-6'
  return (
    <span className="inline-flex gap-0.5" role={onChange ? 'radiogroup' : 'img'} aria-label={`${value} من 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const icon = <Star className={cn(cls, n <= value ? 'fill-warn text-warn' : 'text-line')} />
        return onChange
          ? <button key={n} type="button" role="radio" aria-checked={n === value} aria-label={`${n}`} onClick={() => onChange(n)}>{icon}</button>
          : <span key={n}>{icon}</span>
      })}
    </span>
  )
}
