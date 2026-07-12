import { useEffect, useRef, useState } from 'react'
import type { CaptionSegment } from '../types'
import { getActiveCaptionAt } from '../lib/captions'

type Props = {
  src: string
  captions?: CaptionSegment[] | null
  captionsVtt?: string | null
  className?: string
  aspectClassName?: string
  autoPlay?: boolean
}

/**
 * Player que baixa o arquivo e reproduz via blob URL (evita Content-Type
 * incorreto / Range quebrado no Storage).
 */
export function ClipPlayer({
  src,
  captions = [],
  className = '',
  aspectClassName = 'aspect-[9/16] max-h-[70dvh] w-full object-contain sm:aspect-video',
  autoPlay = false,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const blobUrlRef = useRef<string | null>(null)
  const [playSrc, setPlaySrc] = useState<string | null>(null)
  const [current, setCurrent] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const list = Array.isArray(captions) ? captions : []
  const active = getActiveCaptionAt(list, current)

  useEffect(() => {
    let cancelled = false

    async function prepare() {
      setLoading(true)
      setError(null)
      setCurrent(0)
      setPlaySrc(null)

      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }

      if (src.startsWith('blob:') || src.startsWith('data:')) {
        if (!cancelled) {
          setPlaySrc(src)
          setLoading(false)
        }
        return
      }

      try {
        const res = await fetch(src)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        if (blob.size < 256) throw new Error('Arquivo inválido')
        const type = blob.type?.startsWith('video/') ? blob.type : guessType(src)
        const typed = new Blob([blob], { type })
        const url = URL.createObjectURL(typed)
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        blobUrlRef.current = url
        setPlaySrc(url)
      } catch {
        // Último recurso: URL direta
        if (!cancelled) setPlaySrc(src)
      }
    }

    void prepare()
    return () => {
      cancelled = true
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [src])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !playSrc) return

    const onTime = () => setCurrent(video.currentTime)
    const onReady = () => {
      setLoading(false)
      setError(null)
    }
    const onError = () => {
      setLoading(false)
      setError('Não foi possível reproduzir este vídeo.')
    }

    video.addEventListener('timeupdate', onTime)
    video.addEventListener('seeked', onTime)
    video.addEventListener('loadeddata', onReady)
    video.addEventListener('canplay', onReady)
    video.addEventListener('error', onError)
    return () => {
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('seeked', onTime)
      video.removeEventListener('loadeddata', onReady)
      video.removeEventListener('canplay', onReady)
      video.removeEventListener('error', onError)
    }
  }, [playSrc])

  return (
    <div className={`relative overflow-hidden rounded-3xl bg-canvas ${className}`}>
      {playSrc ? (
        <video
          ref={videoRef}
          key={playSrc}
          src={playSrc}
          controls
          playsInline
          autoPlay={autoPlay}
          preload="auto"
          className={aspectClassName}
        />
      ) : (
        <div className={`${aspectClassName} bg-canvas`} />
      )}
      {loading && !error ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-canvas/50">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
        </div>
      ) : null}
      {error ? (
        <div className="absolute inset-0 grid place-items-center bg-canvas px-4 text-center">
          <p className="text-sm text-white/70">{error}</p>
        </div>
      ) : null}
      {active?.text && !error ? (
        <div className="pointer-events-none absolute inset-x-3 bottom-14 rounded-xl bg-black/70 px-3 py-2 text-center text-sm font-semibold leading-snug text-white sm:bottom-16 sm:text-base">
          {active.text}
        </div>
      ) : null}
    </div>
  )
}

function guessType(url: string) {
  if (url.includes('.webm')) return 'video/webm'
  return 'video/mp4'
}
