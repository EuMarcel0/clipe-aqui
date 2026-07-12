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

  const target = options.preset === 'reels' ? getReelsExportFrame() : null

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
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Este navegador não consegue exportar vídeo. Use Chrome ou Edge.')
  }

  const objectUrl = URL.createObjectURL(videoBlob)
  const video = document.createElement('video')
  video.setAttribute('playsinline', 'true')
  video.setAttribute('webkit-playsinline', 'true')
  video.playsInline = true
  video.preload = 'auto'
  video.muted = true
  video.defaultMuted = true
  video.volume = 0
  video.src = objectUrl

  try {
    await waitFor(video, 'loadeddata', 15_000)
    if (!video.videoWidth || !video.videoHeight) {
      throw new Error(
        'Não foi possível abrir o vídeo cortado neste celular. Tente no computador ou use Chrome.',
      )
    }

    const srcW = video.videoWidth
    const srcH = video.videoHeight
    let width = target?.width ?? srcW
    let height = target?.height ?? srcH
    if (!target) {
      const maxEdge = isMobile() ? 960 : 1280
      const scale = Math.min(1, maxEdge / Math.max(srcW, srcH))
      width = Math.max(2, Math.round((srcW * scale) / 2) * 2)
      height = Math.max(2, Math.round((srcH * scale) / 2) * 2)
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas indisponível')

    // Primeiro frame: alguns celulares só “acordam” o captureStream depois de desenhar
    paintFrame(ctx, video, srcW, srcH, width, height, target, watermark, captions)

    const captureStream =
      typeof canvas.captureStream === 'function' ? canvas.captureStream(24) : null
    if (!captureStream) {
      throw new Error('Este navegador não suporta exportar vídeo com legendas.')
    }

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

    const tracks: MediaStreamTrack[] = [...captureStream.getVideoTracks()]
    if (videoStream) {
      for (const track of videoStream.getAudioTracks()) tracks.push(track)
    }

    let audioCtx: AudioContext | null = null
    if (tracks.length === 1) {
      try {
        audioCtx = new AudioContext()
        if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => undefined)
        const source = audioCtx.createMediaElementSource(video)
        const dest = audioCtx.createMediaStreamDestination()
        source.connect(dest)
        for (const track of dest.stream.getAudioTracks()) tracks.push(track)
      } catch {
        // só vídeo
      }
    }

    const mimeType = pickRecorderMime()
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(new MediaStream(tracks), {
        mimeType: mimeType || undefined,
        videoBitsPerSecond: isMobile() ? 2_500_000 : target ? 4_500_000 : 3_500_000,
      })
    } catch {
      recorder = new MediaRecorder(new MediaStream(tracks))
    }

    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    const stopped = new Promise<Blob>((resolve, reject) => {
      recorder.onerror = () => reject(new Error('Falha ao gravar o vídeo exportado'))
      recorder.onstop = () => {
        resolve(
          new Blob(chunks, {
            type: recorder.mimeType || mimeType || 'video/webm',
          }),
        )
      }
    })

    await seekVideo(video, 0)
    onProgress?.(0.03)

    const clipDuration =
      Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 30

    recorder.start(200)

    try {
      await video.play()
    } catch {
      // Tenta de novo após gesto/estado muted
      video.muted = true
      await video.play()
    }

    onProgress?.(0.05)

    await new Promise<void>((resolve, reject) => {
      let raf = 0
      let finished = false
      // requestVideoFrameCallback é instável em vários celulares — usa rAF
      const deadline = window.setTimeout(
        () => {
          if (!finished) {
            // Se já gravou boa parte, finaliza em vez de falhar
            if (video.currentTime > clipDuration * 0.85) {
              finish()
              return
            }
            finished = true
            cleanupLoops()
            reject(
              new Error(
                'A exportação demorou demais no celular. Tente um trecho mais curto ou o formato Normal.',
              ),
            )
          }
        },
        Math.ceil(clipDuration * 1000) + 25_000,
      )

      const cleanupLoops = () => {
        window.clearTimeout(deadline)
        cancelAnimationFrame(raf)
        video.removeEventListener('ended', onEnded)
        video.removeEventListener('error', onError)
        video.removeEventListener('timeupdate', onTime)
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
      const onTime = () => {
        if (finished) return
        if (video.currentTime >= clipDuration - 0.08) finish()
      }

      video.addEventListener('ended', onEnded)
      video.addEventListener('error', onError)
      video.addEventListener('timeupdate', onTime)

      const loop = () => {
        if (finished) return
        if (video.paused && !video.ended) {
          void video.play().catch(() => undefined)
        } else {
          paintFrame(ctx, video, srcW, srcH, width, height, target, watermark, captions)
          if (clipDuration > 0) {
            onProgress?.(Math.min(0.98, video.currentTime / clipDuration))
          }
        }
        raf = requestAnimationFrame(loop)
      }

      raf = requestAnimationFrame(loop)
    })

    await sleep(250)
    if (recorder.state !== 'inactive') recorder.stop()

    const blob = await withTimeout(stopped, 10_000, 'Falha ao finalizar a gravação do clip')
    await audioCtx?.close().catch(() => undefined)

    if (blob.size < 1024) {
      throw new Error('Exportação do clip ficou vazia')
    }
    return blob
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function paintFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  srcW: number,
  srcH: number,
  width: number,
  height: number,
  target: { width: number; height: number } | null,
  watermark: WatermarkConfig | null,
  captions: CaptionSegment[],
) {
  if (target) {
    drawCoverFrame(ctx, video, srcW, srcH, width, height)
  } else {
    ctx.drawImage(video, 0, 0, width, height)
  }
  drawWatermark(ctx, watermark, width, height)
  drawCaption(ctx, captions, video.currentTime, watermark, width, height)
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
  const candidates = isApple()
    ? ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm']
    : [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
      ]
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

function isMobile() {
  return (
    typeof navigator !== 'undefined' &&
    (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 1 && window.innerWidth < 900))
  )
}

function isApple() {
  return typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent)
}

async function seekVideo(video: HTMLVideoElement, time: number) {
  if (!Number.isFinite(video.duration) || video.duration <= 0) return
  const target = Math.min(Math.max(0, time), Math.max(0, video.duration - 0.05))
  if (Math.abs(video.currentTime - target) < 0.05) return
  video.currentTime = target
  await waitFor(video, 'seeked', 4_000).catch(() => undefined)
}

function waitFor(video: HTMLMediaElement, event: string, timeoutMs = 10_000) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error(`Timeout em ${event}`))
    }, timeoutMs)
    const onOk = () => {
      cleanup()
      resolve()
    }
    const onErr = () => {
      cleanup()
      reject(new Error(`Falha em ${event}`))
    }
    const cleanup = () => {
      window.clearTimeout(timer)
      video.removeEventListener(event, onOk)
      video.removeEventListener('error', onErr)
    }
    video.addEventListener(event, onOk, { once: true })
    video.addEventListener('error', onErr, { once: true })
  })
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        window.clearTimeout(timer)
        reject(err)
      },
    )
  })
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
