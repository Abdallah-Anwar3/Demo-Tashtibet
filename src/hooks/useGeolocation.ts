import { useCallback, useState } from 'react'
import { distanceM } from '@/lib/utils'

export interface GeoFix {
  lat: number
  lng: number
  accuracy: number
}

const MESSAGES: Record<number, string> = {
  1: 'تم رفض إذن الموقع. فعّل الموقع للمتصفح من الإعدادات.',
  2: 'تعذّر تحديد موقعك. تأكد من تشغيل GPS.',
  3: 'انتهت مهلة تحديد الموقع. حاول مرة أخرى.',
}

/** On-demand GPS fix (called when the engineer taps check-in/out). */
export function useGeolocation() {
  const [fix, setFix] = useState<GeoFix | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const locate = useCallback((): Promise<GeoFix> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const msg = 'المتصفح لا يدعم تحديد الموقع.'
        setError(msg)
        reject(new Error(msg))
        return
      }
      setLoading(true)
      setError(null)
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const f = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }
          setFix(f)
          setLoading(false)
          resolve(f)
        },
        (e) => {
          const msg = MESSAGES[e.code] ?? 'خطأ في تحديد الموقع.'
          setError(msg)
          setLoading(false)
          reject(new Error(msg))
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
      )
    })
  }, [])

  /** Is `fix` inside the project's geofence? Projects without coordinates never block. */
  const isWithin = useCallback(
    (f: GeoFix | null, lat: number | null, lng: number | null, radius: number) => {
      if (!f || lat == null || lng == null) return false
      return distanceM(f.lat, f.lng, lat, lng) <= radius
    },
    [],
  )

  return { fix, error, loading, locate, isWithin }
}
