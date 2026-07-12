import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import type { CaptionSegment } from '../types'
import { clamp, formatPrecise } from '../lib/format'
import { getActiveCaptionAt } from '../lib/captions'
import { Button } from './Button'
import { ClipTimeline } from './ClipTimeline'
import type { WatermarkConfig } from '../types'

type Props = {
  src: string
  start: number
  end: number
  duration?: number
  onChangeRange: (start: number, end: number) => void
  captions?: CaptionSegment[]
  watermark?: WatermarkConfig | null
}

export function VideoTrimmer({
  src,
  start,
  end,
  duration: durationProp = 0,
  onChangeRange,
  captions = [],
  watermark = null,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const rangeRef = useRef({ start, end })
  const [duration, setDuration] = useState(durationProp)
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(false)

  rangeRef.current = { start, end }

  const activeCaption = getActiveCaptionAt(captions, current - start)
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

    if (video.readyState >= 1) syncDuration()

    return () => {
      video.removeEventListener('loadedmetadata', syncDuration)
      video.removeEventListener('durationchange', syncDuration)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('play', onPlay)
    }
  }, [src])

  const seekTo = useCallback((time: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = clamp(time, 0, video.duration || time)
    setCurrent(video.currentTime)
  }, [])

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

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-3xl bg-canvas">
        <video
          ref={videoRef}
          src={src}
          playsInline
          preload="metadata"
          className="aspect-[9/16] max-h-[48dvh] w-full object-contain sm:aspect-video sm:max-h-[420px]"
        />
        {watermark?.text.trim() ? (
          <div
            className={`pointer-events-none absolute inset-x-3 text-center text-sm font-semibold tracking-wide text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] sm:text-base ${
              watermark.position === 'top' ? 'top-4' : 'bottom-4'
            }`}
            style={{ opacity: 0.8 }}
          >
            {watermark.text.trim()}
          </div>
        ) : null}
        {activeCaption ? (
          <div
            className={`pointer-events-none absolute inset-x-3 rounded-xl bg-black/65 px-3 py-2 text-center text-sm font-semibold leading-snug text-white ${
              watermark?.text.trim() && watermark.position === 'bottom'
                ? 'bottom-12'
                : 'bottom-4'
            }`}
          >
            {activeCaption.text}
          </div>
        ) : null}
      </div>

      <div className="surface space-y-3 rounded-3xl p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3 px-1">
          <Button type="button" variant="secondary" className="!py-2.5" onClick={() => void togglePlay()}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {playing ? 'Pausar' : 'Prévia'}
          </Button>
          <p className="text-sm font-medium tabular-nums text-muted">
            {formatPrecise(current)} / {formatPrecise(max)}
          </p>
        </div>

        <ClipTimeline
          src={src}
          start={start}
          end={end}
          duration={max}
          current={current}
          onChangeRange={onChangeRange}
          onSeek={seekTo}
        />
      </div>
    </div>
  )
}
