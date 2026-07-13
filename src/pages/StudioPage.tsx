import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Captions, CheckCircle2, Download, ExternalLink, Plus, Upload } from 'lucide-react'
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
import { extractAudioRange, probeMediaDuration } from '../lib/ffmpeg'
import { exportClipFromSource } from '../lib/burnOverlays'
import { REELS_FRAME } from '../lib/exportPresets'
import { formatPrecise, segmentsToVtt } from '../lib/format'
import { getErrorMessage } from '../lib/errors'
import {
  alignCaptionsToAudioDuration,
  normalizeCaptionSegments,
} from '../lib/captions'
import {
  getBillingStatus,
  isQuotaExceededError,
  type BillingStatus,
} from '../lib/billing'
import type {
  CaptionSegment,
  ClipRow,
  ExportPreset,
  StudioStep,
  WatermarkPosition,
} from '../types'

export function StudioPage() {
  const [file, setFile] = useState<File | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [duration, setDuration] = useState(0)
  const [step, setStep] = useState<StudioStep>('upload')
  const [captions, setCaptions] = useState<CaptionSegment[]>([])
  const [exportPreset, setExportPreset] = useState<ExportPreset>('reels')
  const [watermarkText, setWatermarkText] = useState('')
  const [watermarkPosition, setWatermarkPosition] = useState<WatermarkPosition>('bottom')
  const [costUsd, setCostUsd] = useState<number | null>(null)
  const [savedClip, setSavedClip] = useState<ClipRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [billing, setBilling] = useState<BillingStatus | null>(null)
  const [quotaBlocked, setQuotaBlocked] = useState(false)
  const readySoundPlayed = useRef(false)

  const refreshBilling = useCallback(async () => {
    try {
      const status = await getBillingStatus()
      setBilling(status)
      setQuotaBlocked(!status.can_create)
    } catch {
      // billing ainda não migrado / offline — não bloqueia por falha de leitura
    }
  }, [])

  useEffect(() => {
    void refreshBilling()
  }, [refreshBilling])

  useEffect(() => {
    if (step !== 'export' || !savedClip) {
      readySoundPlayed.current = false
      return
    }
    if (readySoundPlayed.current) return
    readySoundPlayed.current = true
    playReadyChime()
    void refreshBilling()
  }, [step, savedClip, refreshBilling])

  const watermark = useMemo(
    () =>
      watermarkText.trim()
        ? { text: watermarkText.trim(), position: watermarkPosition }
        : null,
    [watermarkText, watermarkPosition],
  )

  const clipDuration = Math.max(0, end - start)

  const onPickFile = (next: File | null) => {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    setSavedClip(null)
    setCaptions([])
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
    setCaptions([])
    setCostUsd(null)
  }, [])

  const updateCaptionText = (index: number, text: string) => {
    setCaptions((prev) => prev.map((c, i) => (i === index ? { ...c, text } : c)))
  }

  const generateCaptions = async () => {
    if (!file) return
    if (quotaBlocked || (billing && !billing.can_create)) {
      setQuotaBlocked(true)
      setError(
        'Limite grátis de 10 clips atingido. Compre créditos para gerar legendas e salvar.',
      )
      return
    }
    setBusy(true)
    setError(null)
    setProgress('Extraindo áudio do trecho…')
    try {
      const audio = await extractAudioRange(file, start, end)
      const expectedDuration = clipDuration
      const audioDuration =
        (await probeMediaDuration(audio)) || expectedDuration

      setProgress('Gerando legendas…')
      const result = await transcribeAudio(audio, expectedDuration)

      const aligned = alignCaptionsToAudioDuration(
        result.segments,
        expectedDuration,
        audioDuration,
      )
      setCaptions(normalizeCaptionSegments(aligned, expectedDuration))
      setCostUsd(result.estimated_cost_usd)
      setStep('captions')
    } catch (err) {
      if (isQuotaExceededError(err)) {
        setQuotaBlocked(true)
        void refreshBilling()
      }
      setError(getErrorMessage(err, 'Não foi possível gerar as legendas. Tente de novo.'))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const saveToS3 = async () => {
    if (!file) return
    if (quotaBlocked || (billing && !billing.can_create)) {
      setQuotaBlocked(true)
      setError('Limite grátis de 10 clips atingido. Compre créditos para continuar.')
      return
    }
    setBusy(true)
    setError(null)
    setProgress('Preparando seu clip…')
    try {
      // Exporta antes de consumir a cota — evita gastar create se a gravação falhar
      const blob = await exportClipFromSource(file, start, end, {
        preset: exportPreset,
        captions,
        watermark,
        onProgress: (r) => {
          if (r < 0.95) {
            setProgress(`Gravando no vídeo… ${Math.round(r * 100)}%`)
          } else {
            setProgress('Salvando…')
          }
        },
      })

      setProgress('Registrando clip…')
      const draft = await createClipDraft({
        title: title || 'Clip sem título',
        source_filename: file.name,
        duration_seconds: duration,
        start_seconds: start,
        end_seconds: end,
      })

      setProgress('Enviando clip…')

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
      void refreshBilling()
    } catch (err) {
      console.error('Erro ao salvar clip:', err)
      if (isQuotaExceededError(err)) {
        setQuotaBlocked(true)
        void refreshBilling()
      }
      setError(getErrorMessage(err, 'Não foi possível salvar seu clip. Tente novamente.'))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const downloadSaved = async () => {
    const mediaUrl = savedClip ? resolveClipMediaUrl(savedClip) : null
    if (!savedClip || !mediaUrl) return
    setDownloading(true)
    setError(null)
    try {
      const res = await fetch(mediaUrl)
      if (!res.ok) throw new Error(`Falha ao baixar (${res.status})`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const ext = blob.type.includes('webm') || mediaUrl.includes('.webm') ? 'webm' : 'mp4'
      a.download = `${sanitizeFilename(savedClip.title)}.${ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao baixar o vídeo')
    } finally {
      setDownloading(false)
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

          <label
            className={
              dragOver
                ? 'press surface flex cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-accent bg-accent/10 px-6 py-20 text-center transition'
                : 'press surface flex cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-white/10 px-6 py-20 text-center transition hover:border-accent/40 hover:bg-lift'
            }
            onDragEnter={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragOver(true)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragOver(true)
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragOver(false)
            }}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragOver(false)
              const dropped = [...e.dataTransfer.files].find((f) =>
                f.type.startsWith('video/'),
              )
              if (dropped) onPickFile(dropped)
              else setError('Solte um arquivo de vídeo (MP4, MOV ou WebM).')
            }}
          >
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent text-white shadow-[0_12px_28px_-12px_rgba(255,45,85,0.7)]">
              <Upload className="h-6 w-6" />
            </span>
            <div>
              <p className="font-display text-lg font-bold">
                {dragOver ? 'Solte o vídeo aqui' : 'Escolher vídeo'}
              </p>
              <p className="mt-1 text-sm text-muted">Arraste e solte ou toque · MP4, MOV ou WebM</p>
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
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Formato de exportação">
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
            <p className="mb-2 mt-3 text-xs font-medium text-muted">Posição</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Posição da marca d'água">
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
              Gere legendas com IA no trecho selecionado ({formatPrecise(clipDuration)}).
            </p>

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

            {quotaBlocked ? (
              <div className="mb-3 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3">
                <p className="text-sm font-semibold text-ink">
                  Você usou seus 10 clips grátis
                </p>
                <p className="mt-1 text-sm text-muted">
                  Compre créditos para gerar legendas e salvar clips. 1 crédito = 1
                  clip.
                </p>
                <Link
                  to="/planos"
                  className="press mt-3 inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Ver créditos
                </Link>
              </div>
            ) : billing && billing.free_remaining > 0 ? (
              <p className="mb-3 text-xs text-muted">
                {billing.free_remaining} clip
                {billing.free_remaining === 1 ? '' : 's'} grátis restante
                {billing.free_remaining === 1 ? '' : 's'}
                {billing.credits > 0 ? ` · ${billing.credits} crédito(s)` : ''}
              </p>
            ) : billing && billing.credits > 0 ? (
              <p className="mb-3 text-xs text-muted">
                {billing.credits} crédito{billing.credits === 1 ? '' : 's'} disponível
                {billing.credits === 1 ? '' : 's'}
              </p>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="ghost"
                loading={busy}
                disabled={quotaBlocked}
                onClick={() => void generateCaptions()}
              >
                <Captions className="h-4 w-4" />
                {captions.length ? 'Regenerar' : 'Gerar legendas'}
              </Button>
              <Button
                type="button"
                loading={busy}
                disabled={quotaBlocked}
                onClick={() => void saveToS3()}
              >
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
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
                <a
                  href={resolveClipMediaUrl(savedClip)!}
                  target="_blank"
                  rel="noreferrer"
                  className="press inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-paper"
                >
                  <ExternalLink className="h-4 w-4" />
                  Assistir
                </a>
                <Button
                  type="button"
                  variant="ghost"
                  className="sm:min-w-[8.5rem]"
                  loading={downloading}
                  onClick={() => void downloadSaved()}
                >
                  <Download className="h-4 w-4" />
                  Baixar
                </Button>
              </div>
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
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={
        active
          ? 'flex items-start gap-3 rounded-2xl border border-accent/50 bg-accent/10 px-3 py-3 text-left text-ink ring-1 ring-accent/30'
          : 'flex items-start gap-3 rounded-2xl border border-white/10 bg-mist px-3 py-3 text-left text-muted hover:border-white/20'
      }
    >
      <span
        className={
          active
            ? 'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-accent bg-accent'
            : 'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-white/25 bg-transparent'
        }
        aria-hidden
      >
        {active ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        {subtitle ? (
          <span className="mt-0.5 block text-[11px] font-medium opacity-65">{subtitle}</span>
        ) : null}
      </span>
    </button>
  )
}

function sanitizeFilename(name: string) {
  const cleaned = name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || 'clip'
  return cleaned.slice(0, 80)
}

/** Som curto de “pronto” via Web Audio (sem arquivo externo). */
function playReadyChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const now = ctx.currentTime

    const tone = (freq: number, t0: number, dur: number, gain = 0.08) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
      osc.connect(g)
      g.connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + dur + 0.02)
    }

    tone(523.25, now, 0.16, 0.07)
    tone(659.25, now + 0.12, 0.18, 0.08)
    tone(783.99, now + 0.26, 0.28, 0.06)

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined)
    }, 900)
  } catch {
    // ignore — alguns browsers bloqueiam sem gesto; o save já veio de um clique
  }
}
