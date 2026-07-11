import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, ExternalLink, Trash2 } from 'lucide-react'
import { deleteClip, listMyClips } from '../lib/clips'
import { formatPrecise } from '../lib/format'
import type { ClipRow } from '../types'
import { SharePanel } from '../components/SharePanel'
import { Button } from '../components/Button'

export function LibraryPage() {
  const [clips, setClips] = useState<ClipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ClipRow | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listMyClips()
      setClips(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar biblioteca')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const remove = async (id: string) => {
    if (!confirm('Excluir este clip?')) return
    await deleteClip(id)
    setSelected(null)
    await refresh()
  }

  const download = async (clip: ClipRow) => {
    if (!clip.s3_url) return
    setDownloadingId(clip.id)
    setError(null)
    try {
      const res = await fetch(clip.s3_url)
      if (!res.ok) throw new Error(`Falha ao baixar (${res.status})`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${sanitizeFilename(clip.title)}.mp4`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao baixar o vídeo')
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[1.8rem] bg-ink px-5 py-6 text-paper">
        <p className="font-display text-3xl font-extrabold tracking-tight">Biblioteca</p>
        <p className="mt-2 text-sm text-paper/65">Seus clips salvos no S3, prontos para compartilhar.</p>
      </section>

      {loading ? <p className="text-sm text-ink/55">Carregando…</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {!loading && clips.length === 0 ? (
        <div className="glass rounded-3xl p-6 text-center">
          <p className="font-display text-xl font-bold">Nenhum clip ainda</p>
          <p className="mt-2 text-sm text-ink/55">Vá ao Studio e corte o primeiro.</p>
          <Link to="/" className="mt-4 inline-block text-sm font-semibold text-accent-deep underline">
            Abrir Studio
          </Link>
        </div>
      ) : null}

      <div className="space-y-3">
        {clips.map((clip) => (
          <article key={clip.id} className="glass rounded-3xl p-4">
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                className="text-left"
                onClick={() => setSelected(selected?.id === clip.id ? null : clip)}
              >
                <p className="font-display text-lg font-bold">{clip.title}</p>
                <p className="mt-1 text-xs text-ink/50">
                  {formatPrecise((clip.end_seconds ?? 0) - clip.start_seconds)} · {clip.status}
                  {clip.is_public ? ' · público' : ''}
                </p>
              </button>
              <div className="flex gap-2">
                {clip.s3_url ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      className="!px-3"
                      title="Baixar vídeo"
                      aria-label="Baixar vídeo"
                      loading={downloadingId === clip.id}
                      onClick={() => void download(clip)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <a
                      href={clip.s3_url}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir vídeo"
                      aria-label="Abrir vídeo"
                      className="grid h-10 w-10 place-items-center rounded-xl bg-ink/5 text-ink/70"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  className="!px-3"
                  title="Excluir"
                  aria-label="Excluir"
                  onClick={() => void remove(clip.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {selected?.id === clip.id ? (
              <div className="mt-4 space-y-3">
                {clip.s3_url ? (
                  <video
                    src={clip.s3_url}
                    controls
                    playsInline
                    className="w-full rounded-2xl bg-ink"
                  />
                ) : null}
                <SharePanel
                  clip={selected}
                  onUpdated={(updated) => {
                    setSelected(updated)
                    setClips((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
                  }}
                />
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  )
}

function sanitizeFilename(name: string) {
  const cleaned = name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || 'clip'
  return cleaned.slice(0, 80)
}
