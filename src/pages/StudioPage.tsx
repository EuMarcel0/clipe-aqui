import { useCallback, useMemo, useState } from 'react'
import { Captions, CheckCircle2, ExternalLink, Plus, Upload } from 'lucide-react'
import { VideoTrimmer } from '../components/VideoTrimmer'
import { Button } from '../components/Button'
import { SharePanel } from '../components/SharePanel'
import {
  createClipDraft,
  getUploadUrl,
  resolveClipMediaUrl,
  transcribeAudio,
  updateClip,
  uploadClipToS3,
} from '../lib/clips'
import { cutVideoClip, extractAudioFromBlob, probeMediaDuration } from '../lib/ffmpeg'
import { finalizeClipExport } from '../lib/burnOverlays'
import { REELS_FRAME } from '../lib/exportPresets'
import { estimateTranscriptionCostUsd, formatPrecise, segmentsToVtt } from '../lib/format'
import { getErrorMessage } from '../lib/errors'
import { normalizeCaptionSegments } from '../lib/captions'
import type {
  CaptionSegment,
  ClipRow,
  ExportPreset,
  StudioStep,
  WatermarkPosition,
} from '../types'

type PreparedClip = {
  blob: Blob
  start: number
  end: number
  fileKey: string
}

export function StudioPage() {
  const [file, setFile] = useState<File | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [duration, setDuration] = useState(0)
  const [step, setStep] = useState<StudioStep>('upload')
  const [captions, setCaptions] = useState<CaptionSegment[]>([])
  const [preparedClip, setPreparedClip] = useState<PreparedClip | null>(null)
  const [exportPreset, setExportPreset] = useState<ExportPreset>('reels')
  const [watermarkText, setWatermarkText] = useState('')
  const [watermarkPosition, setWatermarkPosition] = useState<WatermarkPosition>('bottom')
  const [costUsd, setCostUsd] = useState<number | null>(null)
  const [savedClip, setSavedClip] = useState<ClipRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const watermark = useMemo(
    () =>
      watermarkText.trim()
        ? { text: watermarkText.trim(), position: watermarkPosition }
        : null,
    [watermarkText, watermarkPosition],
  )

  const clipDuration = Math.max(0, end - start)
  const estimatedCost = useMemo(
    () => estimateTranscriptionCostUsd(clipDuration),
    [clipDuration],
  )

  const onPickFile = (next: File | null) => {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    setSavedClip(null)
    setCaptions([])
    setPreparedClip(null)
    setWatermarkText('')
    setWatermarkPosition('bottom')
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
    setPreparedClip(null)
    setCaptions([])
    setCostUsd(null)
  }, [])

  const updateCaptionText = (index: number, text: string) => {
    setCaptions((prev) => prev.map((c, i) => (i === index ? { ...c, text } : c)))
  }

  const fileKeyOf = (f: File) => `${f.name}:${f.size}:${f.lastModified}`

  const generateCaptions = async () => {
    if (!file) return
    setBusy(true)
    setError(null)
    setProgress('Preparando o trecho…')
    try {
      const clipBlob = await cutVideoClip(file, start, end)
      const actualDuration = (await probeMediaDuration(clipBlob)) || clipDuration

      setProgress('Gerando legendas…')
      const audio = await extractAudioFromBlob(clipBlob)
      const result = await transcribeAudio(audio, actualDuration)

      setPreparedClip({
        blob: clipBlob,
        start,
        end,
        fileKey: fileKeyOf(file),
      })
      setCaptions(normalizeCaptionSegments(result.segments, actualDuration))
      setCostUsd(result.estimated_cost_usd)
      setStep('captions')
    } catch (err) {
      setError(getErrorMessage(err, 'Não foi possível gerar as legendas. Tente de novo.'))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const saveToS3 = async () => {
    if (!file) return
    setBusy(true)
    setError(null)
    setProgress('Preparando seu clip…')
    try {
      const draft = await createClipDraft({
        title: title || 'Clip sem título',
        source_filename: file.name,
        duration_seconds: duration,
        start_seconds: start,
        end_seconds: end,
      })

      let blob: Blob
      const canReuse =
        preparedClip &&
        preparedClip.fileKey === fileKeyOf(file) &&
        Math.abs(preparedClip.start - start) < 0.05 &&
        Math.abs(preparedClip.end - end) < 0.05

      try {
        blob = canReuse ? preparedClip.blob : await cutVideoClip(file, start, end)
      } catch (err) {
        throw new Error(getErrorMessage(err, 'Não foi possível cortar o vídeo.'))
      }

      try {
        blob = await finalizeClipExport(blob, {
          preset: exportPreset,
          captions,
          watermark,
        })
      } catch (err) {
        throw new Error(
          getErrorMessage(err, 'Não foi possível preparar o vídeo para salvar.'),
        )
      }

      const contentType = blob.type?.startsWith('video/') ? blob.type : 'video/mp4'
      const ext = contentType.includes('webm') ? 'webm' : 'mp4'

      let upload: Awaited<ReturnType<typeof getUploadUrl>>
      try {
        upload = await getUploadUrl(draft.id, `${draft.id}.${ext}`, contentType)
      } catch (err) {
        throw new Error(getErrorMessage(err, 'Não foi possível preparar o envio do clip.'))
      }

      try {
        await uploadClipToS3(blob, { ...upload, contentType })
      } catch (err) {
        throw new Error(getErrorMessage(err, 'Não foi possível enviar o clip.'))
      }

      const captionsVtt = segmentsToVtt(captions)
      const ready = await updateClip(draft.id, {
        s3_key: upload.key,
        s3_url: upload.publicUrl,
        captions,
        captions_vtt: captionsVtt || undefined,
        transcription_cost_usd: costUsd ?? undefined,
        status: 'ready',
        is_public: false,
      })

      setSavedClip(ready)
      setStep('export')
    } catch (err) {
      console.error('Erro ao salvar clip:', err)
      setError(getErrorMessage(err, 'Não foi possível salvar seu clip. Tente novamente.'))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <div className="space-y-4">
      {step === 'upload' ? (
        <div className="slide-up space-y-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Novo projeto</h1>
            <p className="mt-1 text-sm text-muted">Importe um vídeo e monte seu clip.</p>
          </div>

          <label className="press surface flex cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-white/10 px-6 py-20 text-center transition hover:border-accent/40 hover:bg-lift">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent text-white shadow-[0_12px_28px_-12px_rgba(255,45,85,0.7)]">
              <Upload className="h-6 w-6" />
            </span>
            <div>
              <p className="font-display text-lg font-bold">Escolher vídeo</p>
              <p className="mt-1 text-sm text-muted">MP4, MOV ou WebM</p>
            </div>
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      ) : null}

      {objectUrl && step !== 'upload' && step !== 'export' ? (
        <div className="slide-up space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight">Editar</h1>
              <Steps current={step} />
            </div>
            <button
              type="button"
              className="text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
              onClick={() => onPickFile(null)}
            >
              Trocar
            </button>
          </div>

          <label className="block text-sm font-medium text-ink/80">
            Título
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="field mt-1.5"
              placeholder="Nome do clip"
            />
          </label>

          <VideoTrimmer
            src={objectUrl}
            start={start}
            end={end}
            duration={duration}
            onChangeRange={onChangeRange}
            captions={captions}
            watermark={watermark}
          />

          <Section title="Formato de exportação">
            <div className="grid grid-cols-2 gap-2">
              <Choice
                active={exportPreset === 'reels'}
                onClick={() => setExportPreset('reels')}
                title="Reels"
                subtitle={`${REELS_FRAME.width}×${REELS_FRAME.height}`}
              />
              <Choice
                active={exportPreset === 'normal'}
                onClick={() => setExportPreset('normal')}
                title="Normal"
                subtitle="Resolução original"
              />
            </div>
            {exportPreset === 'reels' ? (
              <p className="mt-2 text-xs text-muted">
                TikTok, Instagram, Kwai e YouTube Shorts.
              </p>
            ) : null}
          </Section>

          <Section title="Marca d'água" optional>
            <input
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
              maxLength={48}
              placeholder="@seuusuario"
              className="field"
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Choice
                active={watermarkPosition === 'top'}
                onClick={() => setWatermarkPosition('top')}
                title="Topo"
              />
              <Choice
                active={watermarkPosition === 'bottom'}
                onClick={() => setWatermarkPosition('bottom')}
                title="Base"
              />
            </div>
          </Section>

          <Section title="Legendas">
            <p className="mb-3 text-sm text-muted">
              IA no trecho selecionado · ~US$ {estimatedCost.toFixed(4)}
            </p>

            {costUsd != null ? (
              <p className="mb-3 rounded-xl bg-accent/8 px-3 py-2 text-sm font-medium text-accent-deep">
                Gerado · US$ {costUsd.toFixed(4)}
              </p>
            ) : null}

            {captions.length > 0 ? (
              <div className="mb-3 space-y-2">
                <div className="max-h-52 space-y-2 overflow-y-auto rounded-2xl bg-mist p-3">
                  {captions.map((c, i) => (
                    <label key={`${c.start}-${i}`} className="flex items-start gap-2">
                      <span className="mt-2.5 w-12 shrink-0 font-mono text-[11px] text-muted">
                        {formatPrecise(c.start)}
                      </span>
                      <textarea
                        value={c.text}
                        rows={Math.min(4, Math.max(1, Math.ceil(c.text.length / 42)))}
                        onChange={(e) => updateCaptionText(i, e.target.value)}
                        className="field min-h-10 resize-y !rounded-xl !py-2 text-sm"
                        placeholder="Texto da legenda…"
                      />
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted">As legendas entram gravadas no vídeo.</p>
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
                {captions.length ? 'Regenerar' : 'Gerar legendas'}
              </Button>
              <Button type="button" loading={busy} onClick={() => void saveToS3()}>
                Salvar clip
              </Button>
            </div>
          </Section>
        </div>
      ) : null}

      {step === 'export' && savedClip ? (
        <div className="slide-up space-y-4">
          <div className="surface rounded-3xl p-5 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent/10 text-accent">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <p className="mt-3 font-display text-xl font-bold">Clip pronto</p>
            <p className="mt-1 text-sm text-muted">
              {exportPreset === 'reels'
                ? `Exportado em ${REELS_FRAME.width}×${REELS_FRAME.height}. `
                : ''}
              {savedClip.captions?.length
                ? 'Legendas gravadas no arquivo.'
                : 'Pronto para compartilhar.'}
            </p>
            {resolveClipMediaUrl(savedClip) ? (
              <a
                href={resolveClipMediaUrl(savedClip)!}
                target="_blank"
                rel="noreferrer"
                className="press mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-paper"
              >
                <ExternalLink className="h-4 w-4" />
                Assistir
              </a>
            ) : null}
          </div>
          <SharePanel clip={savedClip} onUpdated={setSavedClip} />
          <Button type="button" variant="ghost" className="w-full" onClick={() => onPickFile(null)}>
            <Plus className="h-4 w-4" />
            Novo projeto
          </Button>
        </div>
      ) : null}

      {progress ? (
          <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-lg px-4 sm:max-w-xl">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-lift px-4 py-3.5 text-ink shadow-xl">
            <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
            <div>
              <p className="text-sm font-semibold">{progress}</p>
              <p className="text-xs text-muted">Aguarde alguns segundos</p>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/8 px-4 py-3 text-sm text-danger">
          {error}
        </p>
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
    export: 'Pronto',
  }
  const idx = items.indexOf(current)

  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      {items.map((item, i) => (
        <span
          key={item}
          className={
            i <= idx
              ? 'text-[11px] font-semibold text-accent'
              : 'text-[11px] font-medium text-muted/50'
          }
        >
          {i > 0 ? <span className="mx-1 text-muted/30">·</span> : null}
          {labels[item]}
        </span>
      ))}
    </div>
  )
}

function Section({
  title,
  optional,
  children,
}: {
  title: string
  optional?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="surface rounded-3xl p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="font-display text-base font-bold tracking-tight">{title}</h2>
        {optional ? <span className="text-[11px] font-medium text-muted">opcional</span> : null}
      </div>
      {children}
    </section>
  )
}

function Choice({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean
  onClick: () => void
  title: string
  subtitle?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'rounded-2xl bg-white px-3 py-3 text-left text-paper'
          : 'rounded-2xl border border-white/10 bg-mist px-3 py-3 text-left text-muted'
      }
    >
      <span className="block text-sm font-semibold">{title}</span>
      {subtitle ? (
        <span className="mt-0.5 block text-[11px] font-medium opacity-65">{subtitle}</span>
      ) : null}
    </button>
  )
}
