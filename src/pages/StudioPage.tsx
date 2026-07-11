import { useCallback, useMemo, useState } from 'react'
import { Captions, CloudUpload, Scissors, Upload, WandSparkles } from 'lucide-react'
import { VideoTrimmer } from '../components/VideoTrimmer'
import { Button } from '../components/Button'
import { SharePanel } from '../components/SharePanel'
import {
  createClipDraft,
  getUploadUrl,
  transcribeAudio,
  updateClip,
  uploadClipToS3,
} from '../lib/clips'
import { cutVideoClip, extractAudioBlob } from '../lib/ffmpeg'
import { estimateTranscriptionCostUsd, formatPrecise } from '../lib/format'
import type { CaptionSegment, ClipRow, StudioStep } from '../types'

export function StudioPage() {
  const [file, setFile] = useState<File | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [duration, setDuration] = useState(0)
  const [step, setStep] = useState<StudioStep>('upload')
  const [captions, setCaptions] = useState<CaptionSegment[]>([])
  const [vtt, setVtt] = useState<string | null>(null)
  const [costUsd, setCostUsd] = useState<number | null>(null)
  const [savedClip, setSavedClip] = useState<ClipRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const clipDuration = Math.max(0, end - start)
  const estimatedCost = useMemo(
    () => estimateTranscriptionCostUsd(clipDuration),
    [clipDuration],
  )

  const onPickFile = (next: File | null) => {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    setSavedClip(null)
    setCaptions([])
    setVtt(null)
    setCostUsd(null)
    setError(null)

    if (!next) {
      setFile(null)
      setObjectUrl(null)
      setStep('upload')
      return
    }

    const url = URL.createObjectURL(next)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = url
    video.onloadedmetadata = () => {
      const d = video.duration || 0
      setDuration(d)
      setStart(0)
      setEnd(Math.min(d, 30))
      setFile(next)
      setObjectUrl(url)
      setTitle(next.name.replace(/\.[^.]+$/, ''))
      setStep('trim')
    }
  }

  const onChangeRange = useCallback((s: number, e: number) => {
    setStart(s)
    setEnd(e)
  }, [])

  const generateCaptions = async () => {
    if (!file) return
    setBusy(true)
    setError(null)
    setProgress('Extraindo áudio do clip…')
    try {
      const audio = await extractAudioBlob(file, start, end)
      setProgress('Gerando legendas com IA…')
      const result = await transcribeAudio(audio, clipDuration)
      setCaptions(result.segments)
      setVtt(result.vtt)
      setCostUsd(result.estimated_cost_usd)
      setStep('captions')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Falha ao gerar legendas. Verifique a Edge Function e OPENAI_API_KEY.',
      )
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const saveToS3 = async () => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      setProgress('Criando registro do clip…')
      const draft = await createClipDraft({
        title: title || 'Clip sem título',
        source_filename: file.name,
        duration_seconds: duration,
        start_seconds: start,
        end_seconds: end,
      })

      setProgress('Cortando vídeo (ffmpeg no browser)…')
      const blob = await cutVideoClip(file, start, end, (ratio) => {
        setProgress(`Cortando vídeo… ${Math.round(ratio * 100)}%`)
      })

      setProgress('Gerando URL assinada do S3…')
      const upload = await getUploadUrl(draft.id, `${draft.id}.mp4`)

      setProgress('Enviando clip para o S3…')
      await uploadClipToS3(blob, upload.uploadUrl, upload.contentType)

      setProgress('Finalizando…')
      const ready = await updateClip(draft.id, {
        s3_key: upload.key,
        s3_url: upload.publicUrl,
        captions,
        captions_vtt: vtt ?? undefined,
        transcription_cost_usd: costUsd ?? undefined,
        status: 'ready',
        is_public: false,
      })

      setSavedClip(ready)
      setStep('export')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Falha ao salvar. Confira Edge Functions e secrets AWS.',
      )
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[1.8rem] bg-ink px-5 py-6 text-paper">
        <p className="font-display text-3xl font-extrabold tracking-tight">Studio</p>
        <p className="mt-2 max-w-sm text-sm text-paper/65">
          Um fluxo direto: escolher vídeo → cortar → legendar → salvar e compartilhar.
        </p>
        <Steps current={step} />
      </section>

      {step === 'upload' ? (
        <label className="glass flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[1.8rem] border border-dashed border-ink/20 px-6 py-16 text-center transition hover:border-accent/50">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent/15 text-accent">
            <Upload className="h-6 w-6" />
          </span>
          <div>
            <p className="font-display text-xl font-bold">Escolher vídeo</p>
            <p className="mt-1 text-sm text-ink/55">MP4, MOV ou WebM · ideal vertical</p>
          </div>
          <input
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
        </label>
      ) : null}

      {objectUrl && step !== 'upload' ? (
        <>
          <label className="block text-sm font-medium">
            Título do clip
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1.5 w-full rounded-2xl border border-ink/10 bg-white/80 px-3 py-3 outline-none ring-accent focus:ring-2"
            />
          </label>

          <VideoTrimmer
            src={objectUrl}
            start={start}
            end={end}
            duration={duration}
            onChangeRange={onChangeRange}
            captions={captions}
          />
        </>
      ) : null}

      {step === 'trim' || step === 'captions' ? (
        <div className="glass space-y-3 rounded-3xl p-4">
          <div className="flex items-start gap-3">
            <WandSparkles className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div>
              <p className="font-display text-lg font-bold">Legendas com IA</p>
              <p className="mt-1 text-sm text-ink/60">
                OpenAI <strong>whisper-1</strong> · estimativa{' '}
                <strong>~US$ {estimatedCost.toFixed(4)}</strong> para{' '}
                {formatPrecise(clipDuration)} de áudio.
              </p>
            </div>
          </div>

          {costUsd != null ? (
            <p className="rounded-2xl bg-accent/10 px-3 py-2 text-sm text-accent-deep">
              Custo estimado desta geração: US$ {costUsd.toFixed(4)}
            </p>
          ) : null}

          {captions.length > 0 ? (
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-2xl bg-ink/5 p-3">
              {captions.map((c, i) => (
                <p key={`${c.start}-${i}`} className="text-sm">
                  <span className="mr-2 font-mono text-xs text-ink/40">
                    {formatPrecise(c.start)}
                  </span>
                  {c.text}
                </p>
              ))}
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="ghost"
              loading={busy}
              onClick={() => void generateCaptions()}
            >
              <Captions className="h-4 w-4" />
              {captions.length ? 'Regenerar legendas' : 'Gerar legendas'}
            </Button>
            <Button type="button" loading={busy} onClick={() => void saveToS3()}>
              <CloudUpload className="h-4 w-4" />
              Salvar no S3
            </Button>
          </div>

          <button
            type="button"
            className="text-xs font-medium text-ink/45 underline-offset-2 hover:underline"
            onClick={() => onPickFile(null)}
          >
            Trocar vídeo
          </button>
        </div>
      ) : null}

      {step === 'export' && savedClip ? (
        <div className="space-y-4">
          <div className="glass rounded-3xl p-4">
            <p className="font-display text-xl font-bold">Clip salvo</p>
            <p className="mt-1 text-sm text-ink/60">
              Disponível no S3 e na sua biblioteca.
            </p>
            {savedClip.s3_url ? (
              <a
                href={savedClip.s3_url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 block break-all text-sm text-accent-deep underline"
              >
                {savedClip.s3_url}
              </a>
            ) : null}
          </div>
          <SharePanel clip={savedClip} onUpdated={setSavedClip} />
          <Button type="button" variant="secondary" className="w-full" onClick={() => onPickFile(null)}>
            <Scissors className="h-4 w-4" />
            Novo clip
          </Button>
        </div>
      ) : null}

      {progress ? (
        <p className="rounded-2xl bg-ink px-4 py-3 text-sm text-paper">{progress}</p>
      ) : null}
      {error ? (
        <p className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>
      ) : null}
    </div>
  )
}

function Steps({ current }: { current: StudioStep }) {
  const items: StudioStep[] = ['upload', 'trim', 'captions', 'export']
  const labels: Record<StudioStep, string> = {
    upload: 'Vídeo',
    trim: 'Corte',
    captions: 'Legenda',
    export: 'Salvar',
  }
  const idx = items.indexOf(current)

  return (
    <ol className="mt-5 flex gap-2">
      {items.map((item, i) => (
        <li
          key={item}
          className={
            i <= idx
              ? 'rounded-full bg-accent px-3 py-1 text-[11px] font-semibold text-ink'
              : 'rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-paper/45'
          }
        >
          {labels[item]}
        </li>
      ))}
    </ol>
  )
}
