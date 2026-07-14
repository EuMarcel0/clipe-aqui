import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

let ffmpeg: FFmpeg | null = null
let loading: Promise<FFmpeg> | null = null
let opCounter = 0

export async function getFFmpeg() {
  if (ffmpeg?.loaded) return ffmpeg
  if (loading) return loading

  loading = (async () => {
    const instance = new FFmpeg()
    const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm'
    await instance.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    ffmpeg = instance
    return instance
  })()

  return loading
}

async function safeDelete(ff: FFmpeg, name: string) {
  try {
    await ff.deleteFile(name)
  } catch {
    // ignore
  }
}

function toBlob(data: Uint8Array | string, type: string) {
  const bytes =
    data instanceof Uint8Array ? data : new TextEncoder().encode(String(data))
  return new Blob([bytes.slice()], { type })
}

function extFromName(name: string) {
  const match = /\.[a-zA-Z0-9]+$/i.exec(name)
  return match?.[0]?.toLowerCase() ?? '.mp4'
}

function blobExt(blob: Blob) {
  if (blob.type.includes('webm')) return '.webm'
  if (blob.type.includes('quicktime')) return '.mov'
  return '.mp4'
}

/**
 * Corta o trecho. Preferência:
 * 1) Browser nativo (suporta AV1/HEVC que o ffmpeg.wasm quebra)
 * 2) ffmpeg reencode
 */
export async function cutVideoClip(
  file: File,
  start: number,
  end: number,
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  const duration = Math.max(0.1, end - start)

  try {
    const browserCut = await cutWithBrowser(file, start, end, onProgress)
    if (browserCut.size >= 1024) return browserCut
  } catch (err) {
    console.warn('Corte via browser falhou, tentando ffmpeg:', err)
  }

  return cutWithFfmpeg(file, start, duration, onProgress)
}

/** Usa o decoder do Chrome/Edge — funciona com AV1. */
async function cutWithBrowser(
  file: File,
  start: number,
  end: number,
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.src = objectUrl
  video.playsInline = true
  video.preload = 'auto'
  video.muted = false
  video.volume = 0

  try {
    await waitMedia(video, 'loadeddata')
    if (!video.videoWidth || !video.videoHeight) {
      throw new Error('Browser não conseguiu decodificar o vídeo')
    }

    const duration = Math.max(0.1, end - start)
    const width = video.videoWidth
    const height = video.videoHeight
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas indisponível')

    const canvasStream = canvas.captureStream(30)
    const capture =
      (
        video as HTMLVideoElement & {
          captureStream?: () => MediaStream
          mozCaptureStream?: () => MediaStream
        }
      ).captureStream?.() ||
      (
        video as HTMLVideoElement & { mozCaptureStream?: () => MediaStream }
      ).mozCaptureStream?.()

    const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()]
    if (capture) {
      for (const t of capture.getAudioTracks()) tracks.push(t)
    }

    let audioCtx: AudioContext | null = null
    if (tracks.length === 1) {
      try {
        audioCtx = new AudioContext()
        const source = audioCtx.createMediaElementSource(video)
        const dest = audioCtx.createMediaStreamDestination()
        source.connect(dest)
        for (const t of dest.stream.getAudioTracks()) tracks.push(t)
      } catch {
        // só vídeo
      }
    }

    const mimeType = pickRecorderMime()
    const recorder = new MediaRecorder(new MediaStream(tracks), {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: 5_000_000,
    })

    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    const stopped = new Promise<Blob>((resolve, reject) => {
      recorder.onerror = () => reject(new Error('Falha ao gravar o corte'))
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || 'video/webm' }))
    })

    // Seek preciso no trecho (com timeout — no mobile seeked pode não disparar)
    const seekTo = Math.max(0, start)
    if (Math.abs(video.currentTime - seekTo) >= 0.05) {
      video.currentTime = seekTo
      await waitMedia(video, 'seeked', 5_000).catch(() => undefined)
    }

    recorder.start(200)

    await new Promise<void>((resolve, reject) => {
      let finished = false
      let raf = 0
      let rvfc = 0
      const supportsRvfc = typeof video.requestVideoFrameCallback === 'function'

      const finish = () => {
        if (finished) return
        finished = true
        cancelAnimationFrame(raf)
        if (supportsRvfc && typeof video.cancelVideoFrameCallback === 'function') {
          video.cancelVideoFrameCallback(rvfc)
        }
        video.pause()
        video.removeEventListener('ended', onEnded)
        video.removeEventListener('error', onError)
        resolve()
      }

      const onEnded = () => finish()
      const onError = () => reject(new Error('Erro ao reproduzir o trecho'))

      video.addEventListener('ended', onEnded)
      video.addEventListener('error', onError)

      const paint = () => {
        if (finished) return
        const t = video.currentTime
        if (t >= end - 0.02) {
          finish()
          return
        }
        ctx.drawImage(video, 0, 0, width, height)
        onProgress?.(Math.min(1, Math.max(0, (t - start) / duration)))
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

      // Timeout de segurança
      window.setTimeout(() => {
        if (!finished) finish()
      }, Math.ceil(duration * 1000) + 8000)

      void video.play().then(() => {
        if (supportsRvfc) loopRvfc()
        else loopRaf()
      }, reject)
    })

    await sleep(150)
    if (recorder.state !== 'inactive') recorder.stop()
    const blob = await stopped
    await audioCtx?.close().catch(() => undefined)

    if (blob.size < 1024) throw new Error('Corte via browser ficou vazio')
    return blob
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function cutWithFfmpeg(
  file: File,
  start: number,
  duration: number,
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  const ff = await getFFmpeg()
  const id = ++opCounter
  const inputName = `in_${id}${extFromName(file.name)}`
  const outputName = `clip_${id}.mp4`
  const logs: string[] = []

  ff.on('log', ({ message }) => {
    logs.push(message)
  })
  if (onProgress) {
    ff.on('progress', ({ progress }) => onProgress(Math.min(1, Math.max(0, progress))))
  }

  await ff.writeFile(inputName, await fetchFile(file))

  // Para AV1, -ss DEPOIS de -i evita "Missing Sequence Header"
  const strategies: string[][] = [
    [
      '-i',
      inputName,
      '-ss',
      String(start),
      '-t',
      String(duration),
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '28',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      outputName,
    ],
    [
      '-ss',
      String(start),
      '-i',
      inputName,
      '-t',
      String(duration),
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '28',
      '-pix_fmt',
      'yuv420p',
      '-an',
      '-movflags',
      '+faststart',
      outputName,
    ],
  ]

  let data: Uint8Array | string | null = null
  try {
    for (const args of strategies) {
      await safeDelete(ff, outputName)
      logs.length = 0
      try {
        await ff.exec(args)
      } catch {
        continue
      }
      try {
        data = await ff.readFile(outputName)
      } catch {
        data = null
      }
      if (data instanceof Uint8Array && data.byteLength >= 1024) break
      data = null
    }
  } finally {
    await safeDelete(ff, inputName)
    await safeDelete(ff, outputName)
  }

  if (!data || !(data instanceof Uint8Array) || data.byteLength < 1024) {
    const hint = logs.slice(-6).join(' | ')
    throw new Error(
      hint.includes('av1') || hint.includes('Sequence Header')
        ? 'Este vídeo está em AV1. Use Chrome/Edge atualizados ou exporte o arquivo em H.264/MP4 e tente de novo.'
        : hint
          ? `Não foi possível cortar esse trecho. ${hint.slice(0, 160)}`
          : 'Não foi possível cortar esse trecho.',
    )
  }

  return toBlob(data, 'video/mp4')
}

/** Extrai áudio de um clip JÁ cortado — timestamps do Whisper batem 1:1 com o vídeo. */
export async function extractAudioFromBlob(videoBlob: Blob): Promise<Blob> {
  // Preferência: WebAudio no browser (não depende do codec no ffmpeg)
  try {
    const browserAudio = await extractAudioBrowser(videoBlob)
    if (browserAudio.size >= 64) return browserAudio
  } catch (err) {
    console.warn('Extract audio browser falhou, tentando ffmpeg:', err)
  }

  const ff = await getFFmpeg()
  const id = ++opCounter
  const inputName = `clip_audio_in_${id}${blobExt(videoBlob)}`
  const outputName = `clip_audio_out_${id}.mp3`

  await ff.writeFile(inputName, await fetchFile(videoBlob))
  await ff.exec([
    '-i',
    inputName,
    '-vn',
    '-acodec',
    'libmp3lame',
    '-ar',
    '16000',
    '-ac',
    '1',
    '-b:a',
    '64k',
    outputName,
  ])

  const data = await ff.readFile(outputName)
  await safeDelete(ff, inputName)
  await safeDelete(ff, outputName)

  const blob = toBlob(data, 'audio/mpeg')
  if (blob.size < 64) throw new Error('Falha ao extrair áudio do clip')
  return blob
}

/**
 * Extrai só o áudio do intervalo [start, end] do arquivo original.
 * Prefere ffmpeg (timestamps fiéis); browser é fallback.
 */
export async function extractAudioRange(
  file: File | Blob,
  start: number,
  end: number,
): Promise<Blob> {
  const duration = Math.max(0.2, end - start)

  try {
    const ffAudio = await extractAudioRangeFfmpeg(file, start, duration)
    if (ffAudio.size >= 64) return ffAudio
  } catch (err) {
    console.warn('Extract audio range ffmpeg falhou, tentando browser:', err)
  }

  const browser = await extractAudioRangeBrowser(file, start, end)
  if (browser.size < 64) throw new Error('Áudio do trecho ficou vazio')
  return browser
}

async function extractAudioRangeFfmpeg(
  file: File | Blob,
  start: number,
  duration: number,
): Promise<Blob> {
  const ff = await getFFmpeg()
  const id = ++opCounter
  const inputName =
    file instanceof File
      ? `range_in_${id}${extFromName(file.name)}`
      : `range_in_${id}${blobExt(file)}`
  const outputName = `range_out_${id}.mp3`

  await ff.writeFile(inputName, await fetchFile(file))
  try {
    // -ss DEPOIS de -i: corte mais preciso no ponto da fala
    await ff.exec([
      '-i',
      inputName,
      '-ss',
      String(Math.max(0, start)),
      '-t',
      String(duration),
      '-vn',
      '-acodec',
      'libmp3lame',
      '-ar',
      '16000',
      '-ac',
      '1',
      '-b:a',
      '64k',
      outputName,
    ])
    const data = await ff.readFile(outputName)
    const blob = toBlob(data, 'audio/mpeg')
    if (blob.size < 64) throw new Error('Áudio do trecho ficou vazio')
    return blob
  } finally {
    await safeDelete(ff, inputName)
    await safeDelete(ff, outputName)
  }
}

async function extractAudioRangeBrowser(
  file: File | Blob,
  start: number,
  end: number,
): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement('video')
    video.src = url
    video.preload = 'auto'
    video.muted = false
    video.volume = 0
    video.playsInline = true
    await waitMedia(video, 'loadeddata', 15_000)

    const stream =
      (
        video as HTMLVideoElement & {
          captureStream?: () => MediaStream
          mozCaptureStream?: () => MediaStream
        }
      ).captureStream?.() ||
      (
        video as HTMLVideoElement & { mozCaptureStream?: () => MediaStream }
      ).mozCaptureStream?.()

    let audioStream: MediaStream
    let audioCtx: AudioContext | null = null
    if (stream && stream.getAudioTracks().length > 0) {
      audioStream = new MediaStream(stream.getAudioTracks())
    } else {
      audioCtx = new AudioContext()
      if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => undefined)
      const source = audioCtx.createMediaElementSource(video)
      const dest = audioCtx.createMediaStreamDestination()
      source.connect(dest)
      audioStream = dest.stream
    }

    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : ''

    const recorder = new MediaRecorder(audioStream, mime ? { mimeType: mime } : undefined)
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    const done = new Promise<Blob>((resolve, reject) => {
      recorder.onerror = () => reject(new Error('Falha ao gravar áudio'))
      recorder.onstop = () =>
        resolve(new Blob(chunks, { type: mime || 'audio/webm' }))
    })

    // Seek preciso + estabiliza antes de gravar (evita Whisper em t=0 com fala atrasada)
    const seekTo = Math.max(0, start)
    video.currentTime = seekTo
    await waitMedia(video, 'seeked', 6_000).catch(() => undefined)
    await sleep(200)
    if (Math.abs(video.currentTime - seekTo) > 0.25) {
      video.currentTime = seekTo
      await waitMedia(video, 'seeked', 4_000).catch(() => undefined)
      await sleep(120)
    }

    recorder.start(100)
    await video.play()

    // Só conta o tempo depois que o play realmente avançou perto do start
    const playStartedAt = performance.now()
    await new Promise<void>((resolve, reject) => {
      let finished = false
      let armed = false
      const finish = () => {
        if (finished) return
        finished = true
        window.clearTimeout(watchdog)
        video.pause()
        video.removeEventListener('timeupdate', onTime)
        video.removeEventListener('ended', onEnded)
        video.removeEventListener('error', onError)
        resolve()
      }
      const onTime = () => {
        if (!armed) {
          if (video.currentTime >= seekTo - 0.15) armed = true
          return
        }
        if (video.currentTime >= end - 0.05) finish()
      }
      const onEnded = () => finish()
      const onError = () => reject(new Error('Erro ao ler áudio do vídeo'))
      const watchdog = window.setTimeout(
        () => finish(),
        Math.ceil((end - start) * 1000) + 10_000,
      )
      video.addEventListener('timeupdate', onTime)
      video.addEventListener('ended', onEnded)
      video.addEventListener('error', onError)

      // Se o play engasgar no start, aborta cedo
      window.setTimeout(() => {
        if (!armed && performance.now() - playStartedAt > 2500) {
          // força armar mesmo assim
          armed = true
        }
      }, 2600)
    })

    if (recorder.state !== 'inactive') recorder.stop()
    const blob = await done
    await audioCtx?.close().catch(() => undefined)
    if (blob.size < 64) throw new Error('Áudio vazio')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function extractAudioBrowser(videoBlob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(videoBlob)
  try {
    const video = document.createElement('video')
    video.src = url
    video.preload = 'auto'
    video.muted = false
    video.volume = 0
    video.playsInline = true
    await waitMedia(video, 'loadeddata')

    const stream =
      (
        video as HTMLVideoElement & {
          captureStream?: () => MediaStream
          mozCaptureStream?: () => MediaStream
        }
      ).captureStream?.() ||
      (
        video as HTMLVideoElement & { mozCaptureStream?: () => MediaStream }
      ).mozCaptureStream?.()

    let audioStream: MediaStream
    if (stream && stream.getAudioTracks().length > 0) {
      audioStream = new MediaStream(stream.getAudioTracks())
    } else {
      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaElementSource(video)
      const dest = audioCtx.createMediaStreamDestination()
      source.connect(dest)
      audioStream = dest.stream
      void audioCtx.close().catch(() => undefined)
    }

    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : ''

    const recorder = new MediaRecorder(audioStream, mime ? { mimeType: mime } : undefined)
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    const done = new Promise<Blob>((resolve, reject) => {
      recorder.onerror = () => reject(new Error('Falha ao gravar áudio'))
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime || 'audio/webm' }))
    })

    video.currentTime = 0
    await waitMedia(video, 'seeked').catch(() => undefined)
    recorder.start(200)
    await video.play()
    await waitMedia(video, 'ended')
    if (recorder.state !== 'inactive') recorder.stop()
    const blob = await done
    if (blob.size < 64) throw new Error('Áudio vazio')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function convertWebmToMp4(
  inputBlob: Blob,
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  const ff = await getFFmpeg()
  const id = ++opCounter
  const inputName = `conv_in_${id}.webm`
  const outputName = `conv_out_${id}.mp4`

  if (onProgress) {
    ff.on('progress', ({ progress }) => onProgress(Math.min(1, Math.max(0, progress))))
  }

  await ff.writeFile(inputName, await fetchFile(inputBlob))
  try {
    await ff.exec([
      '-i',
      inputName,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '28',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      outputName,
    ])
    const data = await ff.readFile(outputName)
    if (data instanceof Uint8Array && data.byteLength >= 1024) {
      return toBlob(data, 'video/mp4')
    }
  } finally {
    await safeDelete(ff, inputName)
    await safeDelete(ff, outputName)
  }

  return inputBlob.type ? inputBlob : new Blob([inputBlob], { type: 'video/webm' })
}

export async function probeMediaDuration(blob: Blob): Promise<number> {
  const url = URL.createObjectURL(blob)
  try {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = url
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('metadata'))
    })
    return Number.isFinite(video.duration) ? video.duration : 0
  } catch {
    return 0
  } finally {
    URL.revokeObjectURL(url)
  }
}

function pickRecorderMime() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }
  return ''
}

function waitMedia(video: HTMLMediaElement, event: string, timeoutMs = 12_000) {
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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
