import type { CaptionSegment, ExportPreset, WatermarkConfig } from '../types'
import { getActiveCaptionAt, normalizeCaptionSegments } from './captions'
import { getReelsExportFrame, drawContainFrame } from './exportPresets'

type ExportOptions = {
  preset: ExportPreset
  captions?: CaptionSegment[]
  watermark?: WatermarkConfig | null
  onProgress?: (ratio: number) => void
}

type FinalizeOptions = ExportOptions

/**
 * Corta + aplica Reels/legendas/marca d'água em UMA passagem no arquivo original.
 * Evita reabrir o WebM intermediário (causa Timeout em loadeddata no celular).
 */
export async function exportClipFromSource(
  file: File,
  start: number,
  end: number,
  options: ExportOptions,
): Promise<Blob> {
  const mark =
    options.watermark?.text.trim()
      ? {
          text: options.watermark.text.trim(),
          position: options.watermark.position,
        }
      : null

  const clipDuration = Math.max(0.2, end - start)
  const usable = normalizeCaptionSegments(
    (options.captions ?? []).filter((c) => c.text.trim().length > 0),
    clipDuration,
  )

  const needsPass =
    options.preset === 'reels' || usable.length > 0 || Boolean(mark)

  const target = options.preset === 'reels' ? getReelsExportFrame() : null

  options.onProgress?.(0.02)

  const blob = await recordSegment(file, start, end, {
    captions: needsPass ? usable : [],
    watermark: needsPass ? mark : null,
    target: needsPass ? target : null,
    // Sem overlays e sem reels: ainda corta, só sem desenhar textos
    scaleDown: !needsPass,
    onProgress: (r) => options.onProgress?.(0.02 + r * 0.98),
  })

  if (blob.size < 1024) {
    throw new Error('Falha ao preparar o vídeo para exportação')
  }
  options.onProgress?.(1)
  return blob
}

/**
 * @deprecated Prefira exportClipFromSource (arquivo original).
 * Mantido para blobs já cortados.
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

  const clipDuration = Math.max(0.2, await probeDuration(videoBlob))
  const usable = normalizeCaptionSegments(
    (options.captions ?? []).filter((c) => c.text.trim().length > 0),
    clipDuration,
  )

  const needsPass =
    options.preset === 'reels' || usable.length > 0 || Boolean(mark)

  if (!needsPass) return videoBlob

  const target = options.preset === 'reels' ? getReelsExportFrame() : null
  options.onProgress?.(0.02)

  const exported = await recordSegment(videoBlob, 0, clipDuration, {
    captions: usable,
    watermark: mark,
    target,
    scaleDown: false,
    onProgress: (r) => options.onProgress?.(0.02 + r * 0.98),
  })

  if (exported.size < 1024) {
    throw new Error('Falha ao preparar o vídeo para exportação')
  }
  options.onProgress?.(1)
  return exported
}

/** @deprecated use exportClipFromSource */
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

type RecordOptions = {
  captions: CaptionSegment[]
  watermark: WatermarkConfig | null
  target: { width: number; height: number } | null
  scaleDown: boolean
  onProgress?: (ratio: number) => void
}

async function recordSegment(
  source: File | Blob,
  start: number,
  end: number,
  options: RecordOptions,
): Promise<Blob> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Este navegador não consegue exportar vídeo. Use Chrome ou Edge.')
  }

  const objectUrl = URL.createObjectURL(source)
  const video = document.createElement('video')
  video.setAttribute('playsinline', 'true')
  video.setAttribute('webkit-playsinline', 'true')
  video.playsInline = true
  video.preload = 'auto'
  video.muted = true
  video.defaultMuted = true
  video.volume = 0
  video.crossOrigin = 'anonymous'
  video.src = objectUrl
  // Safari precisa do elemento no DOM para decodificar áudio de forma estável
  video.style.cssText =
    'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-99px;top:-99px'
  document.body.appendChild(video)

  try {
    await ensureVideoReady(video)

    if (!video.videoWidth || !video.videoHeight) {
      throw new Error('Não foi possível abrir o vídeo neste celular.')
    }

    const srcW = video.videoWidth
    const srcH = video.videoHeight
    let width = options.target?.width ?? srcW
    let height = options.target?.height ?? srcH

    if (!options.target) {
      const maxEdge = isMobile() ? 960 : options.scaleDown ? 1280 : Math.max(srcW, srcH)
      const scale = Math.min(1, maxEdge / Math.max(srcW, srcH))
      width = Math.max(2, Math.round((srcW * scale) / 2) * 2)
      height = Math.max(2, Math.round((srcH * scale) / 2) * 2)
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas indisponível')

    await seekVideo(video, start)
    // Frame inicial para acordar captureStream
    paintFrame(
      ctx,
      video,
      srcW,
      srcH,
      width,
      height,
      options.target,
      options.watermark,
      options.captions,
      0,
    )

    // Safari: captureStream(0) + requestFrame é flaky; Chrome: fps=0 + requestFrame
    // evita vídeo congelar com áudio seguindo.
    const useManualFrames = !isApple()
    const captureStream =
      typeof canvas.captureStream === 'function'
        ? canvas.captureStream(useManualFrames ? 0 : 24)
        : null
    if (!captureStream) {
      throw new Error('Este navegador não suporte exportar vídeo com legendas.')
    }

    const canvasTrack = captureStream.getVideoTracks()[0] as
      | (MediaStreamTrack & { requestFrame?: () => void })
      | undefined

    const tracks: MediaStreamTrack[] = [...captureStream.getVideoTracks()]

    // Áudio: preferir Web Audio (Safari ignora/corta áudio de vídeo muted via captureStream).
    // createMediaElementSource desconecta os alto-falantes → pode desmutar sem eco.
    let audioCtx: AudioContext | null = null
    const audioWired = await wireExportAudio(video, tracks)
    audioCtx = audioWired.audioCtx

    const mimeType = pickRecorderMime()
    const bits = isMobile()
      ? 2_000_000
      : options.target
        ? 3_500_000
        : 3_000_000

    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(new MediaStream(tracks), {
        mimeType: mimeType || undefined,
        videoBitsPerSecond: bits,
        audioBitsPerSecond: 128_000,
      })
    } catch {
      try {
        recorder = new MediaRecorder(new MediaStream(tracks), {
          mimeType: mimeType || undefined,
          videoBitsPerSecond: bits,
        })
      } catch {
        recorder = new MediaRecorder(new MediaStream(tracks))
      }
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

    const segmentDuration = Math.max(0.2, end - start)
    options.onProgress?.(0.04)

    // Safari/iOS: timeslice corrompe/corta o áudio no meio do arquivo.
    // Sem timeslice → um único blob no stop (mais estável no mobile).
    if (isApple() || isMobile()) {
      recorder.start()
    } else {
      recorder.start(1000)
    }
    pushCanvasFrame(ctx, canvasTrack, useManualFrames)

    try {
      await video.play()
    } catch {
      // Autoplay bloqueou com som: tenta muted só se não houver track de áudio via Web Audio
      if (!audioCtx) {
        video.muted = true
        await video.play()
      } else {
        throw new Error('Não foi possível iniciar a exportação com áudio neste Safari.')
      }
    }

    if (audioCtx?.state === 'suspended') {
      await audioCtx.resume().catch(() => undefined)
    }

    options.onProgress?.(0.06)

    await new Promise<void>((resolve, reject) => {
      let tick: number | null = null
      let finished = false
      let lastProgressAt = 0
      const FPS = 24
      const frameMs = 1000 / FPS

      const deadline = window.setTimeout(
        () => {
          if (!finished) {
            if (video.currentTime >= end - segmentDuration * 0.15) {
              finish()
              return
            }
            finished = true
            cleanup()
            reject(
              new Error(
                'A exportação demorou demais no celular. Tente um trecho mais curto.',
              ),
            )
          }
        },
        Math.ceil(segmentDuration * 1000) + 25_000,
      )

      const cleanup = () => {
        window.clearTimeout(deadline)
        if (tick != null) window.clearInterval(tick)
        video.removeEventListener('ended', onEnded)
        video.removeEventListener('error', onError)
        video.removeEventListener('timeupdate', onTime)
        video.removeEventListener('waiting', onWaiting)
        video.removeEventListener('stalled', onWaiting)
      }

      const drawAt = (clipTime: number) => {
        paintFrame(
          ctx,
          video,
          srcW,
          srcH,
          width,
          height,
          options.target,
          options.watermark,
          options.captions,
          clipTime,
        )
        pushCanvasFrame(ctx, canvasTrack, useManualFrames)
      }

      const finish = () => {
        if (finished) return
        finished = true
        drawAt(Math.max(0, Math.min(segmentDuration, video.currentTime - start)))
        cleanup()
        video.pause()
        resolve()
      }

      const onEnded = () => finish()
      const onError = () => {
        if (finished) return
        finished = true
        cleanup()
        reject(new Error('Falha ao reproduzir o vídeo para exportar'))
      }
      const onTime = () => {
        if (video.currentTime >= end - 0.05) finish()
      }
      const onWaiting = () => {
        // Buffering: mantém frames no canvas para o vídeo não “morrer” no WebM
        if (!finished) {
          drawAt(Math.max(0, video.currentTime - start))
        }
      }

      video.addEventListener('ended', onEnded)
      video.addEventListener('error', onError)
      video.addEventListener('timeupdate', onTime)
      video.addEventListener('waiting', onWaiting)
      video.addEventListener('stalled', onWaiting)

      const paintOnce = () => {
        if (finished) return
        if (audioCtx?.state === 'suspended') {
          void audioCtx.resume().catch(() => undefined)
        }
        if (video.paused && !video.ended) {
          void video.play().catch(() => undefined)
        }
        const t = video.currentTime
        if (t >= end - 0.02) {
          finish()
          return
        }
        const clipTime = Math.max(0, t - start)
        drawAt(clipTime)

        const now = performance.now()
        if (now - lastProgressAt > 200) {
          lastProgressAt = now
          options.onProgress?.(Math.min(0.98, clipTime / segmentDuration))
        }
      }

      // Clock próprio + requestFrame: não depende do RAF (engasga com React/GC)
      // nem do captureStream(fps), que para de emitir se o canvas “não muda”.
      tick = window.setInterval(paintOnce, frameMs)
      paintOnce()
    })

    await sleep(300)
    pushCanvasFrame(ctx, canvasTrack, useManualFrames)
    if (recorder.state !== 'inactive') recorder.stop()

    const blob = await withTimeout(stopped, 12_000, 'Falha ao finalizar a gravação do clip')
    await audioCtx?.close().catch(() => undefined)

    // Para tracks para liberar encoder
    for (const t of tracks) {
      try {
        t.stop()
      } catch {
        // ignore
      }
    }

    if (blob.size < 1024) throw new Error('Exportação do clip ficou vazia')
    return blob
  } finally {
    video.remove()
    URL.revokeObjectURL(objectUrl)
  }
}

/** Força o Chrome a capturar um frame novo do canvas (bug clássico do captureStream). */
function pushCanvasFrame(
  ctx: CanvasRenderingContext2D,
  track?: MediaStreamTrack & { requestFrame?: () => void },
  manual = true,
) {
  // Marca o bitmap como “sujo” mesmo se o frame do vídeo for igual
  const prev = ctx.globalAlpha
  ctx.globalAlpha = 0.01
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, 1, 1)
  ctx.globalAlpha = prev
  if (manual) track?.requestFrame?.()
}

/**
 * Liga áudio do <video> ao MediaRecorder.
 * Preferência: Web Audio (estável no Safari) → fallback captureStream.
 */
async function wireExportAudio(
  video: HTMLVideoElement,
  tracks: MediaStreamTrack[],
): Promise<{ audioCtx: AudioContext | null }> {
  // Desmutar: MediaElementSource captura silêncio se muted=true (Safari rigoroso).
  video.muted = false
  video.defaultMuted = false
  video.volume = 1

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) throw new Error('no AudioContext')

    const audioCtx = new AudioCtx()
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume().catch(() => undefined)
    }
    const sourceNode = audioCtx.createMediaElementSource(video)
    const dest = audioCtx.createMediaStreamDestination()
    sourceNode.connect(dest)
    // Sem connect(destination) → sem som pelos alto-falantes durante a exportação
    const audioTracks = dest.stream.getAudioTracks()
    if (!audioTracks.length) {
      await audioCtx.close().catch(() => undefined)
      throw new Error('no audio tracks from Web Audio')
    }
    for (const track of audioTracks) tracks.push(track)
    return { audioCtx }
  } catch {
    // Fallback: faixa de áudio do próprio elemento
    try {
      const videoStream =
        (
          video as HTMLVideoElement & {
            captureStream?: () => MediaStream
            mozCaptureStream?: () => MediaStream
          }
        ).captureStream?.() ||
        (
          video as HTMLVideoElement & { mozCaptureStream?: () => MediaStream }
        ).mozCaptureStream?.()

      const fromEl = videoStream?.getAudioTracks() ?? []
      if (fromEl.length) {
        for (const track of fromEl) tracks.push(track)
        return { audioCtx: null }
      }
    } catch {
      // só vídeo
    }
    // Sem áudio disponível — volta muted para não quebrar autoplay se play() ainda não rodou
    video.muted = true
    video.defaultMuted = true
    return { audioCtx: null }
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
  clipTime: number,
) {
  if (target) {
    drawContainFrame(ctx, video, srcW, srcH, width, height)
  } else {
    ctx.drawImage(video, 0, 0, width, height)
  }
  drawWatermark(ctx, watermark, width, height)
  drawCaption(ctx, captions, clipTime, watermark, width, height)
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
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9,opus',
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

/** Abre o vídeo de forma resiliente no mobile (loadedmetadata + readyState). */
async function ensureVideoReady(video: HTMLVideoElement) {
  if (video.readyState >= 2 && video.videoWidth > 0) return

  video.load()

  await Promise.race([
    waitFor(video, 'loadedmetadata', 12_000),
    waitFor(video, 'loadeddata', 12_000),
    waitFor(video, 'canplay', 12_000),
  ]).catch(() => undefined)

  if (video.readyState >= 1 && video.videoWidth > 0) return

  // Última tentativa: play/pause força decode em alguns Androids
  try {
    await video.play()
    video.pause()
  } catch {
    // ignore
  }

  if (video.readyState < 1 || !video.videoWidth) {
    throw new Error('Timeout ao abrir o vídeo. Feche outros apps e tente de novo.')
  }
}

async function seekVideo(video: HTMLVideoElement, time: number) {
  const duration = Number.isFinite(video.duration) ? video.duration : time + 1
  const target = Math.min(Math.max(0, time), Math.max(0, duration - 0.05))
  if (Math.abs(video.currentTime - target) < 0.08) return
  video.currentTime = target
  await waitFor(video, 'seeked', 5_000).catch(() => undefined)
  // Se seeked não veio, espera um pouco mesmo assim
  await sleep(80)
}

async function probeDuration(blob: Blob) {
  const url = URL.createObjectURL(blob)
  try {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = url
    await waitFor(video, 'loadedmetadata', 8_000).catch(() => undefined)
    return Number.isFinite(video.duration) ? video.duration : 0
  } finally {
    URL.revokeObjectURL(url)
  }
}

function waitFor(video: HTMLMediaElement, event: string, timeoutMs = 10_000) {
  return new Promise<void>((resolve, reject) => {
    if (event === 'loadedmetadata' && video.readyState >= 1) {
      resolve()
      return
    }
    if (event === 'loadeddata' && video.readyState >= 2) {
      resolve()
      return
    }
    if (event === 'canplay' && video.readyState >= 3) {
      resolve()
      return
    }
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
