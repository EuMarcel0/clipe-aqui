import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getClipByShareToken, resolveClipMediaUrl } from '../lib/clips'
import { ClipPlayer } from '../components/ClipPlayer'
import type { ClipRow } from '../types'

export function SharePage() {
  const { token } = useParams()
  const [clip, setClip] = useState<ClipRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    ;(async () => {
      setLoading(true)
      try {
        const data = await getClipByShareToken(token)
        if (!data) setError('Clip não encontrado ou link desativado.')
        setClip(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao abrir clip')
      } finally {
        setLoading(false)
      }
    })()
  }, [token])

  if (loading) {
    return (
      <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink/10 border-t-accent" />
        <p className="text-sm text-muted">Abrindo clip…</p>
      </div>
    )
  }

  if (error || !clip) {
    return (
      <div className="surface mt-10 rounded-3xl p-8 text-center">
        <p className="font-display text-2xl font-bold">Link indisponível</p>
        <p className="mt-2 text-sm text-muted">{error ?? 'Clip não encontrado.'}</p>
      </div>
    )
  }

  const mediaUrl = resolveClipMediaUrl(clip)

  return (
    <div className="slide-up space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Clipe Aqui</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">{clip.title}</h1>
      </div>

      {mediaUrl ? (
        <ClipPlayer src={mediaUrl} captions={clip.captions} />
      ) : (
        <p className="text-sm text-muted">Vídeo ainda não disponível.</p>
      )}

      {Array.isArray(clip.captions) && clip.captions.length > 0 ? (
        <div className="surface rounded-3xl p-4">
          <p className="font-display text-base font-bold">Legendas</p>
          <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
            {clip.captions.map((c, i) => (
              <p key={`${c.start}-${i}`} className="text-sm leading-relaxed text-ink/75">
                {c.text}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
