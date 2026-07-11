import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

let ffmpeg: FFmpeg | null = null
let loading: Promise<FFmpeg> | null = null

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

export async function cutVideoClip(
  file: File,
  start: number,
  end: number,
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  const ff = await getFFmpeg()
  const inputName = 'input' + extFromName(file.name)
  const outputName = 'clip.mp4'
  const duration = Math.max(0.1, end - start)

  if (onProgress) {
    ff.on('progress', ({ progress }) => onProgress(Math.min(1, progress)))
  }

  await ff.writeFile(inputName, await fetchFile(file))
  await ff.exec([
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
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    outputName,
  ])

  const data = await ff.readFile(outputName)
  await ff.deleteFile(inputName)
  await ff.deleteFile(outputName)

  const bytes =
    data instanceof Uint8Array
      ? data
      : new TextEncoder().encode(String(data))
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy.buffer], { type: 'video/mp4' })
}

export async function extractAudioBlob(
  file: File,
  start: number,
  end: number,
): Promise<Blob> {
  const ff = await getFFmpeg()
  const inputName = 'input' + extFromName(file.name)
  const outputName = 'audio.mp3'
  const duration = Math.max(0.1, end - start)

  await ff.writeFile(inputName, await fetchFile(file))
  await ff.exec([
    '-ss',
    String(start),
    '-i',
    inputName,
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
  await ff.deleteFile(inputName)
  await ff.deleteFile(outputName)

  const bytes =
    data instanceof Uint8Array
      ? data
      : new TextEncoder().encode(String(data))
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy.buffer], { type: 'audio/mpeg' })
}

function extFromName(name: string) {
  const match = /\.[a-z0-9]+$/i.exec(name)
  return match?.[0]?.toLowerCase() ?? '.mp4'
}
