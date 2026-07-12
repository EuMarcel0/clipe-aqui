import type { CaptionSegment, ExportPreset, WatermarkConfig } from '../types'
import { probeMediaDuration } from './ffmpeg'
import { getActiveCaptionAt, normalizeCaptionSegments } from './captions'
import { getReelsExportFrame, drawCoverFrame } from './exportPresets'

type FinalizeOptions = {
  preset: ExportPreset
  captions?: CaptionSegment[]
  watermark?: WatermarkConfig | null
  onProgress?: (ratio: number) => void
}

/**
 * Aplica formato de export (normal/reels) + legendas/marca d'água.
 * Retorna WebM/MP4 do MediaRecorder — sem ffmpeg.wasm (evita travar no browser).
 */
export async function finalizeClipExport(
  videoBlob: Blob,
  options: FinalizeOptions,
): Promise<Blob> {
  const mark =
    options.watermark?.text.trim()
      ? {
          text: options.watermark.text.trim(),
          position: options.watermark.position,
        }
      : null

  const duration = await probeMediaDuration(videoBlob)
  const usable = normalizeCaptionSegments(
    (options.captions ?? []).filter((c) => c.text.trim().length > 0),
    duration,
  )

  const needsPass =
    options.preset === 'reels' || usable.length > 0 || Boolean(mark)

  if (!needsPass) return videoBlob

  const target =
    options.preset === 'reels' ? getReelsExportFrame() : null

  options.onProgress?.(0.02)
  const exported = await renderWithCanvas(
    videoBlob,
    usable,
    mark,
    target,
    (r) => options.onProgress?.(0.02 + r * 0.98),
  )

  if (exported.size < 1024) {
    throw new Error('Falha ao preparar o vídeo para exportação')
  }

  options.onProgress?.(1)
  return exported
}

/** @deprecated use finalizeClipExport */
export async function burnCaptionsIntoVideo(
  videoBlob: Blob,
  captions: CaptionSegment[],
  onProgress?: (ratio: number) => void,
  watermark?: WatermarkConfig | null,
): Promise<Blob> {
  return finalizeClipExport(videoBlob, {
    preset: 'normal',
    captions,
    watermark,
    onProgress,
  })
}

async function renderWithCanvas(
  videoBlob: Blob,
  captions: CaptionSegment[],
  watermark: WatermarkConfig | null,
  target: { width: number; height: number } | null,
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  const objectUrl = URL.createObjectURL(videoBlob)
  const video = document.createElement('video')
  video.src = objectUrl
  video.playsInline = true
  video.preload = 'auto'
  video.muted = true
  video.volume = 0

  try {
    await waitFor(video, 'loadeddata')
    if (!video.videoWidth || !video.videoHeight) {
      throw new Error('Vídeo sem dimensões para exportar')
    }

    const srcW = video.videoWidth
    const srcH = video.videoHeight
    // Limita resolução de encode para não matar o browser
    let width = target?.width ?? srcW
    let height = target?.height ?? srcH
    if (!target) {
      const maxEdge = 1280
      const scale = Math.min(1, maxEdge / Math.max(srcW, srcH))
      width = Math.max(2, Math.round((srcW * scale) / 2) * 2)
      height = Math.max(2, Math.round((srcH * scale) / 2) * 2)
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas indisponível')

    const canvasStream = canvas.captureStream(24)
    const videoStream =
      (
        video as HTMLVideoElement & {
          captureStream?: () => MediaStream
          mozCaptureStream?: () => MediaStream
        }
      ).captureStream?.() ||
      (
        video as HTMLVideoElement & {
          mozCaptureStream?: () => MediaStream
        }
      ).mozCaptureStream?.()

    const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()]
    if (videoStream) {
      for (const track of videoStream.getAudioTracks()) tracks.push(track)
    }

    let audioCtx: AudioContext | null = null
    if (tracks.length === 1) {
      try {
        audioCtx = new AudioContext()
        const source = audioCtx.createMediaElementSource(video)
        const dest = audioCtx.createMediaStreamDestination()
        source.connect(dest)
        for (const track of dest.stream.getAudioTracks()) tracks.push(track)
      } catch {
        // só vídeo
      }
    }

    const mimeType = pickRecorderMime()
    if (!mimeType && typeof MediaRecorder === 'undefined') {
      throw new Error('Este navegador não consegue exportar vídeo. Use Chrome ou Edge.')
    }

    const recorder = new MediaRecorder(new MediaStream(tracks), {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: target ? 4_500_000 : 3_500_000,
    })

    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    const stopped = new Promise<Blob>((resolve, reject) => {
      recorder.onerror = () => reject(new Error('Falha ao gravar o vídeo exportado'))
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: mimeType || 'video/webm' }))
      }
    })

    video.currentTime = 0
    await waitFor(video, 'seeked').catch(() => undefined)

    recorder.start(250)

    const clipDuration = Number.isFinite(video.duration) ? video.duration : 30

    await new Promise<void>((resolve, reject) => {
      let raf = 0
      let rvfc = 0
      let finished = false
      const supportsRvfc = typeof video.requestVideoFrameCallback === 'function'
      const deadline = window.setTimeout(
        () => {
          if (!finished) {
            finished = true
            cleanupLoops()
            reject(
              new Error(
                'A exportação demorou demais. Tente um trecho mais curto ou use o formato Normal.',
              ),
            )
          }
        },
        Math.ceil(clipDuration * 1000) + 20_000,
      )

      const cleanupLoops = () => {
        window.clearTimeout(deadline)
        cancelAnimationFrame(raf)
        if (supportsRvfc && typeof video.cancelVideoFrameCallback === 'function') {
          video.cancelVideoFrameCallback(rvfc)
        }
        video.removeEventListener('ended', onEnded)
        video.removeEventListener('error', onError)
      }

      const finish = () => {
        if (finished) return
        finished = true
        cleanupLoops()
        video.pause()
        resolve()
      }

      const onEnded = () => finish()
      const onError = () => {
        if (finished) return
        finished = true
        cleanupLoops()
        reject(new Error('Falha ao reproduzir o clip para exportar'))
      }

      video.addEventListener('ended', onEnded)
      video.addEventListener('error', onError)

      const paint = () => {
        if (finished) return
        if (video.paused && !video.ended) {
          void video.play().catch(() => undefined)
          return
        }
        if (target) {
          drawCoverFrame(ctx, video, srcW, srcH, width, height)
        } else {
          ctx.drawImage(video, 0, 0, width, height)
        }
        drawWatermark(ctx, watermark, width, height)
        drawCaption(ctx, captions, video.currentTime, watermark, width, height)
        if (clipDuration > 0) onProgress?.(Math.min(1, video.currentTime / clipDuration))
      }

      const loopRaf = () => {
        if (finished) return
        paint()
        if (!finished) raf = requestAnimationFrame(loopRaf)
      }

      const loopRvfc = () => {
        if (finished) return
        paint()
        if (!finished) rvfc = video.requestVideoFrameCallback(() => loopRvfc())
      }

      void video
        .play()
        .then(() => {
          if (supportsRvfc) loopRvfc()
          else loopRaf()
        })
        .catch((err) => {
          if (!finished) {
            finished = true
            cleanupLoops()
            reject(err instanceof Error ? err : new Error('Não foi possível iniciar a prévia'))
          }
        })
    })

    await sleep(200)
    if (recorder.state !== 'inactive') recorder.stop()

    const blob = await stopped
    await audioCtx?.close().catch(() => undefined)

    if (blob.size < 1024) {
      throw new Error('Exportação do clip ficou vazia')
    }
    return blob
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  watermark: WatermarkConfig | null,
  width: number,
  height: number,
) {
  if (!watermark?.text.trim()) return

  const fontSize = Math.max(20, Math.round(width * 0.042))
  ctx.save()
  ctx.globalAlpha = 0.8
  ctx.font = `700 ${fontSize}px "Plus Jakarta Sans", Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = watermark.position === 'top' ? 'top' : 'bottom'
  ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.1))
  ctx.strokeStyle = 'rgba(0,0,0,0.75)'
  ctx.fillStyle = '#ffffff'
  const y =
    watermark.position === 'top'
      ? Math.max(18, Math.round(height * 0.045))
      : height - Math.max(18, Math.round(height * 0.045))
  const text = watermark.text.trim()
  ctx.strokeText(text, width / 2, y)
  ctx.fillText(text, width / 2, y)
  ctx.restore()
}

function drawCaption(
  ctx: CanvasRenderingContext2D,
  captions: CaptionSegment[],
  time: number,
  watermark: WatermarkConfig | null,
  width: number,
  height: number,
) {
  const active = getActiveCaptionAt(captions, time)
  if (!active?.text.trim()) return

  const lines = wrapText(active.text.trim(), 28)
  const fontSize = Math.max(22, Math.round(width * 0.048))
  const lineHeight = fontSize * 1.25
  const bottomPad =
    watermark?.text.trim() && watermark.position === 'bottom'
      ? Math.max(78, height * 0.15)
      : Math.max(40, height * 0.08)
  const baseY = height - bottomPad

  ctx.save()
  ctx.font = `700 ${fontSize}px "Plus Jakarta Sans", Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.lineWidth = Math.max(3, Math.round(fontSize * 0.14))
  ctx.strokeStyle = 'rgba(0,0,0,0.9)'
  ctx.fillStyle = '#ffffff'

  lines.forEach((line, idx) => {
    const y = baseY - (lines.length - 1 - idx) * lineHeight
    ctx.strokeText(line, width / 2, y)
    ctx.fillText(line, width / 2, y)
  })
  ctx.restore()
}

function wrapText(text: string, maxChars: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxChars && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines.slice(0, 3)
}

function pickRecorderMime() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }
  return ''
}

function waitFor(video: HTMLMediaElement, event: string) {
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
      video.removeEventListener(event, onOk)
      video.removeEventListener('error', onErr)
    }
    video.addEventListener(event, onOk, { once: true })
    video.addEventListener('error', onErr, { once: true })
  })
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
