import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getClipByShareToken } from '../lib/clips'
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
    return <p className="py-20 text-center text-sm text-ink/55">Abrindo clip…</p>
  }

  if (error || !clip) {
    return (
      <div className="glass mt-10 rounded-3xl p-6 text-center">
        <p className="font-display text-2xl font-bold">Link indisponível</p>
        <p className="mt-2 text-sm text-ink/55">{error ?? 'Clip não encontrado.'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[1.8rem] bg-ink px-5 py-6 text-paper">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Clipe Aqui</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight">{clip.title}</h1>
      </section>

      {clip.s3_url ? (
        <div className="overflow-hidden rounded-[1.6rem] bg-ink shadow-[0_24px_50px_-28px_rgba(18,20,26,0.7)]">
          <video
            src={clip.s3_url}
            controls
            playsInline
            className="aspect-[9/16] max-h-[70dvh] w-full object-contain sm:aspect-video"
          >
            {clip.captions_vtt ? (
              <track kind="captions" srcLang="pt" label="Português" default src={vttToBlobUrl(clip.captions_vtt)} />
            ) : null}
          </video>
        </div>
      ) : (
        <p className="text-sm text-ink/55">Vídeo ainda não disponível.</p>
      )}

      {Array.isArray(clip.captions) && clip.captions.length > 0 ? (
        <div className="glass rounded-3xl p-4">
          <p className="font-display text-lg font-bold">Legendas</p>
          <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
            {clip.captions.map((c, i) => (
              <p key={`${c.start}-${i}`} className="text-sm text-ink/80">
                {c.text}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function vttToBlobUrl(vtt: string) {
  const blob = new Blob([vtt], { type: 'text/vtt' })
  return URL.createObjectURL(blob)
}
