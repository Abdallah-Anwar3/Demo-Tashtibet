import { useState } from 'react'
import { Send } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useRequestMessages, useSendRequestMessage } from '@/hooks/useData'
import { Button, Input, Spinner, useToast } from '@/components/ui'
import { fmtDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ClientRequest } from '@/lib/types'

/** Conversation under one request; used by the client and by managers. */
export function RequestThread({ request, nameOf }: { request: ClientRequest; nameOf: (id: string) => string }) {
  const { profile } = useAuth()
  const toast = useToast()
  const msgs = useRequestMessages(request.id)
  const send = useSendRequestMessage()
  const [text, setText] = useState('')

  const submit = () => {
    if (!profile || !text.trim()) return
    send.mutate({ request_id: request.id, author_id: profile.id, body: text.trim() }, {
      onSuccess: () => setText(''),
      onError: (e) => toast((e as Error).message, 'bad'),
    })
  }

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <div className={cn('rounded-lg bg-raised p-3 text-sm')}>
        <div className="mb-1 text-[11px] text-muted">{nameOf(request.client_id)} · {fmtDateTime(request.created_at)}</div>
        <p className="whitespace-pre-wrap">{request.body}</p>
      </div>
      {msgs.isLoading ? <Spinner /> : msgs.data?.map((m) => (
        <div key={m.id} className={cn('max-w-[85%] rounded-lg p-3 text-sm', m.author_id === profile?.id ? 'self-end bg-brand-soft' : 'self-start bg-raised')}>
          <div className="mb-1 text-[11px] text-muted">{nameOf(m.author_id)} · {fmtDateTime(m.created_at)}</div>
          <p className="whitespace-pre-wrap">{m.body}</p>
        </div>
      ))}
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب رداً…" onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
        <Button loading={send.isPending} onClick={submit} aria-label="إرسال"><Send className="h-4 w-4" /></Button>
      </div>
    </div>
  )
}
