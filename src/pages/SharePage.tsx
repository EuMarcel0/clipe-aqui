import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getClipByShareToken, resolveClipMediaUrl } from '../lib/clips'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import { BrandLogo } from '../components/BrandLogo'
import { ClipPlayer } from '../components/ClipPlayer'
import type { ClipRow } from '../types'

export function SharePage() {
  const { token } = useParams()
  const [clip, setClip] = useState<ClipRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useDocumentMeta({
    title: clip?.title
      ? `${clip.title} — clip no Clipe Aqui`
      : 'Assistir clip — Clipe Aqui',
    description: clip?.title
      ? `Assista “${clip.title}”, criado no Clipe Aqui — editor de vídeos com legendas por IA para Reels e Shorts.`
      : 'Assista a um clip criado no Clipe Aqui — corte, legendas com IA e export vertical para redes sociais.',
    path: token ? `/s/${token}` : '/s',
    type: 'video.other',
    image: '/og-image.png',
  })

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
      <ShareChrome>
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink/10 border-t-accent" />
          <p className="text-sm text-muted">Abrindo clip…</p>
        </div>
      </ShareChrome>
    )
  }

  if (error || !clip) {
    return (
      <ShareChrome>
        <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
          <p className="font-display text-2xl font-bold">Link indisponível</p>
          <p className="mt-2 text-sm text-muted">{error ?? 'Clip não encontrado.'}</p>
        </div>
      </ShareChrome>
    )
  }

  const mediaUrl = resolveClipMediaUrl(clip)

  return (
    <ShareChrome>
      {mediaUrl ? (
        <div className="flex flex-1 items-center justify-center">
          <ClipPlayer
            src={mediaUrl}
            captions={[]}
            aspectClassName="aspect-[9/16] max-h-[min(78dvh,720px)] w-full object-contain"
          />
        </div>
      ) : (
        <p className="text-center text-sm text-muted">Vídeo ainda não disponível.</p>
      )}
    </ShareChrome>
  )
}

function ShareChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-6 pt-4 sm:max-w-xl">
      <header className="mb-5">
        <Link to="/" className="inline-flex items-center gap-2.5">
          <BrandLogo className="h-9 w-9" />
          <p className="font-display text-lg font-bold tracking-tight text-ink">Clipe Aqui</p>
        </Link>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  )
}
