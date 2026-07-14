import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import type { CaptionLook, CaptionSegment, WatermarkConfig } from '../types'
import { DEFAULT_CAPTION_LOOK } from '../types'
import { clamp, formatPrecise } from '../lib/format'
import { getActiveCaptionAt } from '../lib/captions'
import { Button } from './Button'
import { ClipTimeline } from './ClipTimeline'

type Props = {
  src: string
  start: number
  end: number
  duration?: number
  onChangeRange: (start: number, end: number) => void
  captions?: CaptionSegment[]
  captionLook?: CaptionLook
  watermark?: WatermarkConfig | null
  maxClipSeconds?: number | null
}

export function VideoTrimmer({
  src,
  start,
  end,
  duration: durationProp = 0,
  onChangeRange,
  captions = [],
  captionLook = DEFAULT_CAPTION_LOOK,
  watermark = null,
  maxClipSeconds = null,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const rangeRef = useRef({ start, end })
  const [duration, setDuration] = useState(durationProp)
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(false)

  rangeRef.current = { start, end }

  const clipTime = current - start
  const inClipRange = current >= start - 0.02 && current < end
  const activeCaption = inClipRange
    ? getActiveCaptionAt(captions, clipTime)
    : null
  const max = duration > 0 ? duration : Math.max(end, start + 1, 1)

  useEffect(() => {
    if (durationProp > 0) setDuration(durationProp)
  }, [durationProp])

  // Mantém o playhead no início do corte ao carregar o vídeo
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const snap = () => {
      const s = rangeRef.current.start
      if (video.paused && Math.abs(video.currentTime - s) > 0.15) {
        video.currentTime = s
        setCurrent(s)
      }
    }
    if (video.readyState >= 1) snap()
  }, [src])

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
        setCurrent(s)
        setPlaying(false)
      }
    }

    const onPause = () => setPlaying(false)
    const onPlay = () => setPlaying(true)

    const onMeta = () => {
      syncDuration()
      const s = rangeRef.current.start
      video.currentTime = s
      setCurrent(s)
    }

    video.addEventListener('loadedmetadata', onMeta)
    video.addEventListener('durationchange', syncDuration)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('pause', onPause)
    video.addEventListener('play', onPlay)

    if (video.readyState >= 1) onMeta()

    return () => {
      video.removeEventListener('loadedmetadata', onMeta)
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
            className={`pointer-events-none absolute left-1/2 w-[92%] max-w-full -translate-x-1/2 text-center text-sm font-semibold leading-snug sm:text-base ${
              captionLook.position === 'center'
                ? 'top-1/2 -translate-y-1/2'
                : watermark?.text.trim() && watermark.position === 'bottom'
                  ? 'bottom-12'
                  : 'bottom-4'
            }`}
          >
            <span
              className={
                captionLook.style === 'box'
                  ? 'inline rounded-[0.45em] bg-white px-[0.45em] pt-[0.12em] pb-[0.22em] leading-none text-black [box-decoration-break:clone] [-webkit-box-decoration-break:clone]'
                  : 'inline rounded-xl px-1 text-white [text-shadow:0_1px_2px_rgba(0,0,0,.9),0_0_8px_rgba(0,0,0,.55)]'
              }
            >
              {activeCaption.text}
            </span>
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
          duration={duration}
          current={current}
          onChangeRange={onChangeRange}
          onSeek={seekTo}
          maxClipSeconds={maxClipSeconds}
        />
      </div>
    </div>
  )
}
