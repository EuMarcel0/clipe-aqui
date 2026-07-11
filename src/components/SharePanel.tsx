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
    <div className="glass space-y-3 rounded-3xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-bold">Compartilhar</p>
          <p className="mt-1 text-sm text-ink/60">
            Link público do clip {clip.is_public ? 'ativo' : 'desativado'}.
          </p>
        </div>
        <Share2 className="mt-1 h-5 w-5 text-accent" />
      </div>

      <div className="rounded-2xl bg-ink/5 px-3 py-2.5 text-xs break-all text-ink/70">
        {shareUrl}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="ghost" loading={busy} onClick={() => void copyLink()}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copiado' : 'Copiar link'}
        </Button>
        <Button type="button" loading={busy} onClick={() => void nativeShare()}>
          <Share2 className="h-4 w-4" />
          Enviar
        </Button>
      </div>

      {clip.is_public ? (
        <button
          type="button"
          className="w-full text-center text-xs font-medium text-ink/45 underline-offset-2 hover:underline"
          onClick={() => void disableShare()}
        >
          Desativar link público
        </button>
      ) : null}
    </div>
  )
}
