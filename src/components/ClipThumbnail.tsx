import { useEffect, useState } from 'react'
import { Film } from 'lucide-react'

type Props = {
  src: string
  className?: string
}

/**
 * Gera um poster estático a partir do vídeo (mais confiável que <video preload>).
 */
export function ClipThumbnail({ src, className = '' }: Props) {
  const [poster, setPoster] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    async function capture() {
      setPoster(null)
      setFailed(false)
      try {
        const res = await fetch(src)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        if (blob.size < 256) throw new Error('Arquivo vazio')

        objectUrl = URL.createObjectURL(blob)
        const video = document.createElement('video')
        video.muted = true
        video.playsInline = true
        video.preload = 'auto'
        video.src = objectUrl

        await waitEvent(video, 'loadeddata')
        if (!video.videoWidth) throw new Error('Sem frame')

        const seekTo = Math.min(0.35, Math.max(0.05, (video.duration || 1) * 0.08))
        if (Number.isFinite(video.duration) && video.duration > 0) {
          video.currentTime = seekTo
          await waitEvent(video, 'seeked')
        }

        const canvas = document.createElement('canvas')
        const maxW = 480
        const scale = Math.min(1, maxW / video.videoWidth)
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas')
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        const dataUrl = canvas.toDataURL('image/jpeg', 0.72)
        if (!cancelled) setPoster(dataUrl)
      } catch {
        if (!cancelled) setFailed(true)
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl)
      }
    }

    void capture()
    return () => {
      cancelled = true
    }
  }, [src])

  if (poster) {
    return (
      <img
        src={poster}
        alt=""
        className={`h-full w-full object-cover ${className}`}
        draggable={false}
      />
    )
  }

  return (
    <div className={`grid h-full w-full place-items-center bg-canvas ${className}`}>
      {failed ? (
        <Film className="h-8 w-8 text-white/25" />
      ) : (
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
      )}
    </div>
  )
}

function waitEvent(target: HTMLMediaElement, event: string) {
  return new Promise<void>((resolve, reject) => {
    const onOk = () => {
      cleanup()
      resolve()
    }
    const onErr = () => {
      cleanup()
      reject(new Error(event))
    }
    const cleanup = () => {
      target.removeEventListener(event, onOk)
      target.removeEventListener('error', onErr)
    }
    target.addEventListener(event, onOk, { once: true })
    target.addEventListener('error', onErr, { once: true })
  })
}
