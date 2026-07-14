import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clamp, formatPrecise, formatTime } from '../lib/format'

type DragMode = 'start' | 'end' | 'playhead' | 'move' | null

type Props = {
  src: string
  start: number
  end: number
  duration: number
  current: number
  onChangeRange: (start: number, end: number) => void
  onSeek: (time: number) => void
  /** Teto do corte (ex.: 50s no free). */
  maxClipSeconds?: number | null
}

const MIN_CLIP = 0.2
/** Poucos frames + yield evitam travar o browser em vídeos grandes do celular. */
const THUMB_COUNT = 6

function yieldToMain() {
  return new Promise<void>((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 80 })
    } else {
      window.setTimeout(() => resolve(), 0)
    }
  })
}

export function ClipTimeline({
  src,
  start,
  end,
  duration,
  current,
  onChangeRange,
  onSeek,
  maxClipSeconds = null,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragMode = useRef<DragMode>(null)
  const dragOrigin = useRef({ x: 0, start: 0, end: 0 })
  const [thumbs, setThumbs] = useState<string[]>([])
  const [thumbsLoading, setThumbsLoading] = useState(false)
  const [dragging, setDragging] = useState<DragMode>(null)

  const max = duration > 0 ? duration : Math.max(end, start + 1, 1)
  const maxLen = maxClipSeconds && maxClipSeconds > 0 ? maxClipSeconds : null

  const toRatio = useCallback((time: number) => clamp(time / max, 0, 1), [max])
  const toTime = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el) return 0
      const rect = el.getBoundingClientRect()
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
      return ratio * max
    },
    [max],
  )

  const ticks = useMemo(() => buildTicks(max), [max])

  useEffect(() => {
    let cancelled = false
    let video: HTMLVideoElement | null = null

    async function capture() {
      // Espera duração real do arquivo — evita gerar thumbs 2x com estimativa
      if (!src || duration <= 0) return
      setThumbsLoading(true)
      setThumbs([])

      // Deixa a UI do trim pintar antes de seekar o vídeo
      await yieldToMain()
      await new Promise<void>((r) => window.setTimeout(() => r(), 40))
      if (cancelled) return

      video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.preload = 'metadata'
      video.src = src

      try {
        await Promise.race([
          waitForEvent(video, 'loadeddata'),
          new Promise<never>((_, reject) =>
            window.setTimeout(() => reject(new Error('timeout')), 12_000),
          ),
        ])
      } catch {
        if (!cancelled) {
          setThumbs([])
          setThumbsLoading(false)
        }
        return
      }

      if (cancelled) return

      const canvas = document.createElement('canvas')
      const w = 64
      const h = Math.max(
        36,
        Math.round((video.videoHeight / Math.max(video.videoWidth, 1)) * w),
      )
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { alpha: false })
      if (!ctx) {
        setThumbsLoading(false)
        return
      }

      const frames: string[] = []
      // Só amostra o começo útil (até ~clip máx free/pago), não o filme inteiro
      const sampleUntil = Math.min(max, maxLen && maxLen > 0 ? Math.max(maxLen, 60) : 90)

      for (let i = 0; i < THUMB_COUNT; i++) {
        if (cancelled) break
        await yieldToMain()
        if (cancelled || !video) break

        const t = (i / Math.max(THUMB_COUNT - 1, 1)) * Math.max(sampleUntil - 0.05, 0)
        try {
          video.currentTime = t
          await Promise.race([
            waitForEvent(video, 'seeked'),
            new Promise<never>((_, reject) =>
              window.setTimeout(() => reject(new Error('seek timeout')), 4_000),
            ),
          ])
        } catch {
          continue
        }
        if (cancelled) break

        try {
          ctx.drawImage(video, 0, 0, w, h)
          frames.push(canvas.toDataURL('image/jpeg', 0.45))
        } catch {
          // ignore frame
        }
      }

      if (!cancelled) {
        setThumbs(frames)
        setThumbsLoading(false)
      }

      video.removeAttribute('src')
      video.load()
      video = null
    }

    void capture().catch(() => {
      if (!cancelled) {
        setThumbs([])
        setThumbsLoading(false)
      }
    })

    return () => {
      cancelled = true
      if (video) {
        video.removeAttribute('src')
        video.load()
      }
    }
  }, [src, duration, max, maxLen])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const mode = dragMode.current
      if (!mode) return
      e.preventDefault()
      const time = toTime(e.clientX)

      if (mode === 'start') {
        const minStart = maxLen ? Math.max(0, end - maxLen) : 0
        const next = clamp(time, minStart, end - MIN_CLIP)
        onChangeRange(next, end)
        onSeek(next)
      } else if (mode === 'end') {
        const maxEnd = maxLen ? Math.min(max, start + maxLen) : max
        const next = clamp(time, start + MIN_CLIP, maxEnd)
        onChangeRange(start, next)
        onSeek(Math.max(start, next - 0.05))
      } else if (mode === 'playhead') {
        onSeek(clamp(time, start, end))
      } else if (mode === 'move') {
        const el = trackRef.current
        if (!el) return
        const dx = e.clientX - dragOrigin.current.x
        const dt = (dx / el.getBoundingClientRect().width) * max
        let clipLen = dragOrigin.current.end - dragOrigin.current.start
        if (maxLen) clipLen = Math.min(clipLen, maxLen)
        let nextStart = dragOrigin.current.start + dt
        nextStart = clamp(nextStart, 0, max - clipLen)
        onChangeRange(nextStart, nextStart + clipLen)
      }
    }

    const onUp = () => {
      if (!dragMode.current) return
      dragMode.current = null
      setDragging(null)
    }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [end, max, maxLen, onChangeRange, onSeek, start, toTime])

  const beginDrag = (mode: DragMode, e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragMode.current = mode
    dragOrigin.current = { x: e.clientX, start, end }
    setDragging(mode)
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  const seekFromTrack = (e: React.PointerEvent) => {
    if (dragMode.current) return
    const time = toTime(e.clientX)
    if (time < start || time > end) {
      // clique fora da seleção: move o handle mais próximo
      if (Math.abs(time - start) <= Math.abs(time - end)) {
        const minStart = maxLen ? Math.max(0, end - maxLen) : 0
        const next = clamp(time, minStart, end - MIN_CLIP)
        onChangeRange(next, end)
        onSeek(next)
      } else {
        const maxEnd = maxLen ? Math.min(max, start + maxLen) : max
        const next = clamp(time, start + MIN_CLIP, maxEnd)
        onChangeRange(start, next)
        onSeek(Math.max(start, next - 0.05))
      }
      return
    }
    onSeek(time)
  }

  const startPct = toRatio(start) * 100
  const endPct = toRatio(end) * 100
  const playPct = toRatio(clamp(current, 0, max)) * 100
  const selWidth = Math.max(endPct - startPct, 0.5)

  return (
    <div className="overflow-hidden rounded-2xl bg-canvas text-white">
      <div className="flex items-center justify-between gap-2 border-b border-white/8 px-3 py-2 text-[11px] font-medium tracking-wide text-white/50">
        <span>
          IN {formatPrecise(start)} · OUT {formatPrecise(end)}
        </span>
          <span className="text-accent">{formatPrecise(Math.max(0, end - start))}</span>
          {maxLen ? (
            <span className="text-white/40"> · máx. {formatPrecise(maxLen)}</span>
          ) : null}
      </div>

      {/* Régua */}
      <div className="relative h-6 border-b border-white/8 px-2">
        <div className="relative h-full w-full">
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute top-0 flex h-full flex-col items-center"
              style={{ left: `${toRatio(t) * 100}%` }}
            >
              <span className="h-2 w-px bg-white/35" />
              <span className="mt-0.5 -translate-x-1/2 text-[9px] text-white/40">
                {formatTime(t)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        className="relative mx-2 mb-3 mt-2 h-[72px] touch-none select-none"
        onPointerDown={seekFromTrack}
      >
        {/* Filmstrip total */}
        <div className="absolute inset-0 overflow-hidden rounded-lg bg-[#2a2f3a] ring-1 ring-white/10">
          <div className="flex h-full w-full">
            {(thumbs.length ? thumbs : Array.from({ length: THUMB_COUNT })).map((thumb, i) => (
              <div
                key={i}
                className="h-full flex-1 border-r border-black/30 bg-[#343a48] last:border-r-0"
                style={
                  typeof thumb === 'string'
                    ? {
                        backgroundImage: `url(${thumb})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }
                    : undefined
                }
              />
            ))}
          </div>
          {thumbsLoading && thumbs.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 animate-pulse bg-white/5" />
          ) : null}
          {/* Escurece fora da seleção */}
          <div
            className="pointer-events-none absolute inset-y-0 left-0 bg-black/55"
            style={{ width: `${startPct}%` }}
          />
          <div
            className="pointer-events-none absolute inset-y-0 right-0 bg-black/55"
            style={{ width: `${100 - endPct}%` }}
          />
        </div>

        {/* Seleção ativa */}
        <div
          className="absolute inset-y-0 z-10"
          style={{ left: `${startPct}%`, width: `${selWidth}%` }}
          onPointerDown={(e) => beginDrag('move', e)}
        >
          <div
            className={`h-full rounded-lg border-2 ${
              dragging === 'move' ? 'border-white' : 'border-accent'
            } bg-accent/15 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]`}
          >
            <div className="absolute inset-x-0 top-0 h-1 rounded-t-md bg-accent" />
            <div className="pointer-events-none absolute inset-x-2 top-2 truncate text-[10px] font-semibold text-white/90 drop-shadow">
              Clip · {formatPrecise(end - start)}
            </div>
          </div>

          {/* Handle início */}
          <Handle
            side="start"
            active={dragging === 'start'}
            onPointerDown={(e) => beginDrag('start', e)}
          />
          {/* Handle fim */}
          <Handle
            side="end"
            active={dragging === 'end'}
            onPointerDown={(e) => beginDrag('end', e)}
          />
        </div>

        {/* Playhead */}
        <div
          className="absolute top-[-22px] bottom-0 z-20 w-px bg-white"
          style={{ left: `${playPct}%` }}
          onPointerDown={(e) => beginDrag('playhead', e)}
        >
          <button
            type="button"
            aria-label="Playhead"
            className="absolute left-1/2 top-0 flex h-4 w-3 -translate-x-1/2 items-start justify-center"
            onPointerDown={(e) => beginDrag('playhead', e)}
          >
            <span className="h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-white drop-shadow" />
          </button>
        </div>
      </div>

      <p className="px-3 pb-3 text-[11px] text-white/35">
        Arraste as bordas para cortar. Toque na faixa para posicionar.
      </p>
    </div>
  )
}

function Handle({
  side,
  active,
  onPointerDown,
}: {
  side: 'start' | 'end'
  active: boolean
  onPointerDown: (e: React.PointerEvent) => void
}) {
  return (
    <button
      type="button"
      aria-label={side === 'start' ? 'Início do clip' : 'Fim do clip'}
      className={`absolute inset-y-0 z-30 w-5 touch-none ${
        side === 'start' ? '-left-2.5 cursor-ew-resize' : '-right-2.5 cursor-ew-resize'
      }`}
      onPointerDown={onPointerDown}
    >
      <span
        className={`absolute inset-y-1 ${
          side === 'start' ? 'left-1.5' : 'right-1.5'
        } flex w-2 flex-col items-center justify-center rounded-sm bg-accent shadow-md ${
          active ? 'ring-2 ring-white/80' : ''
        }`}
      >
        <span className="h-3 w-px bg-white/50" />
        <span className="mt-0.5 h-3 w-px bg-white/50" />
      </span>
    </button>
  )
}

function buildTicks(duration: number) {
  if (duration <= 0) return [0]
  const step =
    duration <= 15 ? 1 : duration <= 60 ? 5 : duration <= 180 ? 15 : duration <= 600 ? 30 : 60
  const ticks: number[] = []
  for (let t = 0; t <= duration + 0.001; t += step) {
    ticks.push(Number(t.toFixed(2)))
  }
  if (ticks[ticks.length - 1] < duration - 0.05) ticks.push(Number(duration.toFixed(2)))
  return ticks
}

function waitForEvent(target: HTMLMediaElement, event: string) {
  return new Promise<void>((resolve, reject) => {
    const onOk = () => {
      cleanup()
      resolve()
    }
    const onErr = () => {
      cleanup()
      reject(new Error(`Falha em ${event}`))
    }
    const cleanup = () => {
      target.removeEventListener(event, onOk)
      target.removeEventListener('error', onErr)
    }
    target.addEventListener(event, onOk, { once: true })
    target.addEventListener('error', onErr, { once: true })
  })
}
