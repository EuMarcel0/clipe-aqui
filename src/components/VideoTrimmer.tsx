import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import type { CaptionSegment } from '../types'
import { clamp, formatPrecise } from '../lib/format'
import { Button } from './Button'

type Props = {
  src: string
  start: number
  end: number
  /** Duração já conhecida (ex.: do upload) — evita slider com max=1 */
  duration?: number
  onChangeRange: (start: number, end: number) => void
  captions?: CaptionSegment[]
}

export function VideoTrimmer({
  src,
  start,
  end,
  duration: durationProp = 0,
  onChangeRange,
  captions = [],
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const rangeRef = useRef({ start, end })
  const [duration, setDuration] = useState(durationProp)
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(false)

  rangeRef.current = { start, end }

  const activeCaption = captions.find((c) => current >= c.start && current <= c.end)
  const max = duration > 0 ? duration : Math.max(end, start + 1, 1)

  useEffect(() => {
    if (durationProp > 0) setDuration(durationProp)
  }, [durationProp])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const syncDuration = () => {
      const d = video.duration
      if (Number.isFinite(d) && d > 0) setDuration(d)
    }

    const onTime = () => {
      const t = video.currentTime
      setCurrent(t)
      const { start: s, end: e } = rangeRef.current
      if (t >= e - 0.05) {
        video.pause()
        video.currentTime = s
        setPlaying(false)
      }
    }

    const onPause = () => setPlaying(false)
    const onPlay = () => setPlaying(true)

    video.addEventListener('loadedmetadata', syncDuration)
    video.addEventListener('durationchange', syncDuration)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('pause', onPause)
    video.addEventListener('play', onPlay)

    // Metadata pode já estar pronta (blob URL reutilizado)
    if (video.readyState >= 1) syncDuration()

    return () => {
      video.removeEventListener('loadedmetadata', syncDuration)
      video.removeEventListener('durationchange', syncDuration)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('play', onPlay)
    }
  }, [src])

  const togglePlay = async () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      if (video.currentTime < start || video.currentTime >= end) {
        video.currentTime = start
      }
      await video.play()
    } else {
      video.pause()
    }
  }

  const setStart = (value: number) => {
    const next = clamp(value, 0, Math.max(0, end - 0.2))
    onChangeRange(next, end)
    if (videoRef.current) videoRef.current.currentTime = next
  }

  const setEnd = (value: number) => {
    const upper = duration > 0 ? duration : max
    const next = clamp(value, start + 0.2, upper)
    onChangeRange(start, next)
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(start, next - 0.05)
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-[1.6rem] bg-ink shadow-[0_24px_50px_-28px_rgba(18,20,26,0.7)]">
        <video
          ref={videoRef}
          src={src}
          playsInline
          preload="metadata"
          className="aspect-[9/16] max-h-[58dvh] w-full object-contain sm:aspect-video sm:max-h-[420px]"
        />
        {activeCaption ? (
          <div className="pointer-events-none absolute inset-x-3 bottom-4 rounded-xl bg-black/65 px-3 py-2 text-center text-sm font-semibold leading-snug text-white">
            {activeCaption.text}
          </div>
        ) : null}
      </div>

      <div className="glass rounded-3xl p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Button type="button" variant="secondary" className="!py-2.5" onClick={() => void togglePlay()}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {playing ? 'Pausar' : 'Prévia'}
          </Button>
          <p className="text-sm font-medium text-ink/70">
            {formatPrecise(current)} · clip {formatPrecise(Math.max(0, end - start))}
          </p>
        </div>

        <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.14em] text-ink/45">
          Início — {formatPrecise(start)}
          <input
            type="range"
            min={0}
            max={max}
            step={0.1}
            value={clamp(start, 0, max)}
            onChange={(e) => setStart(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--color-accent)]"
          />
        </label>

        <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-ink/45">
          Fim — {formatPrecise(end)}
          <input
            type="range"
            min={0}
            max={max}
            step={0.1}
            value={clamp(end, 0, max)}
            onChange={(e) => setEnd(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--color-accent)]"
          />
        </label>
      </div>
    </div>
  )
}
