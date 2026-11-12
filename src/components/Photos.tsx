import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { downloadStorageFile, signedUrls, type Bucket } from '@/lib/imageUtils'
import { Button, Modal, useToast } from '@/components/ui'

interface Shot { url: string; path: string; name: string }

/** Thumbnail strip + lightbox with download (single file, or all files of one report). */
export function Photos({ paths, label, bucket = 'site-reports' }: { paths: string[]; label: string; bucket?: Bucket }) {
  const toast = useToast()
  const [urls, setUrls] = useState<string[]>([])
  const [open, setOpen] = useState<Shot | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    void signedUrls(bucket, paths).then((u) => live && setUrls(u))
    return () => { live = false }
  }, [paths, bucket])

  if (!paths.length) return <span className="text-xs text-muted">بدون صور</span>

  const shots: Shot[] = urls.map((url, i) => ({ url, path: paths[i], name: `${label}-${i + 1}.jpg` }))
  const save = (s: Shot) => downloadStorageFile(bucket, s.path, s.name).catch((e) => toast((e as Error).message, 'bad'))

  const saveAll = async () => {
    setBusy(true)
    for (const s of shots) {
      await save(s)
      await new Promise((r) => setTimeout(r, 400)) // browsers drop downloads fired in the same tick
    }
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {shots.map((s, i) => (
          <button key={s.path} onClick={() => setOpen(s)} aria-label={`فتح الصورة ${i + 1}`}>
            <img src={s.url} alt={`توثيق ${i + 1}`} loading="lazy" className="h-16 w-16 rounded-lg border border-line object-cover" />
          </button>
        ))}
      </div>
      {shots.length > 1 && (
        <div><Button size="sm" variant="secondary" loading={busy} onClick={() => void saveAll()}><Download className="h-3.5 w-3.5" /> تنزيل كل الصور ({shots.length})</Button></div>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title="صورة التوثيق"
        footer={<Button onClick={() => open && void save(open)}><Download className="h-4 w-4" /> تنزيل الصورة</Button>}>
        {open && <img src={open.url} alt="صورة موقع" className="mx-auto max-h-[70vh] rounded-lg" />}
      </Modal>
    </div>
  )
}
