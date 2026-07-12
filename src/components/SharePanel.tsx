import { useMemo, useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import { copyText } from '../lib/format'
import { updateClip } from '../lib/clips'
import type { ClipRow } from '../types'
import { Button } from './Button'

type Props = {
  clip: ClipRow
  onUpdated?: (clip: ClipRow) => void
}

export function SharePanel({ clip, onUpdated }: Props) {
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const shareUrl = useMemo(() => {
    const origin = window.location.origin
    return `${origin}/s/${clip.share_token}`
  }, [clip.share_token])

  const enableShare = async () => {
    setBusy(true)
    try {
      const updated = await updateClip(clip.id, { is_public: true })
      onUpdated?.(updated)
    } finally {
      setBusy(false)
    }
  }

  const disableShare = async () => {
    setBusy(true)
    try {
      const updated = await updateClip(clip.id, { is_public: false })
      onUpdated?.(updated)
    } finally {
      setBusy(false)
    }
  }

  const copyLink = async () => {
    if (!clip.is_public) await enableShare()
    await copyText(shareUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const nativeShare = async () => {
    if (!clip.is_public) await enableShare()
    if (navigator.share) {
      await navigator.share({
        title: clip.title,
        text: 'Veja este clip no Clipe Aqui',
        url: shareUrl,
      })
      return
    }
    await copyLink()
  }

  return (
    <div className="surface space-y-3 rounded-3xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-base font-bold tracking-tight">Compartilhar</p>
          <p className="mt-0.5 text-sm text-muted">
            Link {clip.is_public ? 'ativo' : 'privado'}
          </p>
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/10 text-accent">
          <Share2 className="h-4 w-4" />
        </span>
      </div>

      <div className="rounded-xl bg-mist px-3 py-2.5 font-mono text-[11px] break-all text-muted">
        {shareUrl}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="ghost" loading={busy} onClick={() => void copyLink()}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copiado' : 'Copiar'}
        </Button>
        <Button type="button" loading={busy} onClick={() => void nativeShare()}>
          <Share2 className="h-4 w-4" />
          Enviar
        </Button>
      </div>

      {clip.is_public ? (
        <button
          type="button"
          className="w-full text-center text-xs font-medium text-muted underline-offset-2 hover:text-ink hover:underline"
          onClick={() => void disableShare()}
        >
          Desativar link
        </button>
      ) : null}
    </div>
  )
}
