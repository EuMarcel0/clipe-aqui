import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Check,
  CheckSquare,
  Download,
  ExternalLink,
  Film,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { deleteClips, listMyClips, resolveClipMediaUrl } from '../lib/clips'
import { formatPrecise } from '../lib/format'
import type { ClipRow } from '../types'
import { SharePanel } from '../components/SharePanel'
import { Button } from '../components/Button'
import { ClipPlayer } from '../components/ClipPlayer'
import { ClipThumbnail } from '../components/ClipThumbnail'
import { ConfirmDialog } from '../components/ConfirmDialog'

export function LibraryPage() {
  const [clips, setClips] = useState<ClipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ClipRow | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(
    null,
  )
  const [deleting, setDeleting] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const longPressTimer = useRef<number | null>(null)
  const longPressTriggered = useRef(false)

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

  useEffect(() => {
    if (!selected || pendingDeleteIds) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, pendingDeleteIds])

  useEffect(() => {
    if (!selectMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pendingDeleteIds) exitSelectMode()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectMode, pendingDeleteIds])

  const pickedCount = picked.size
  const allSelected = clips.length > 0 && pickedCount === clips.length

  const exitSelectMode = () => {
    setSelectMode(false)
    setPicked(new Set())
  }

  const enterSelectMode = (firstId?: string) => {
    setSelected(null)
    setSelectMode(true)
    if (firstId) setPicked(new Set([firstId]))
  }

  const togglePick = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allSelected) {
      setPicked(new Set())
      return
    }
    setPicked(new Set(clips.map((c) => c.id)))
  }

  const confirmRemove = async () => {
    if (!pendingDeleteIds?.length) return
    setDeleting(true)
    setError(null)
    try {
      await deleteClips(pendingDeleteIds)
      setPendingDeleteIds(null)
      setSelected(null)
      exitSelectMode()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir o clip')
    } finally {
      setDeleting(false)
    }
  }

  const download = async (clip: ClipRow) => {
    const mediaUrl = resolveClipMediaUrl(clip)
    if (!mediaUrl) return
    setDownloadingId(clip.id)
    setError(null)
    try {
      const res = await fetch(mediaUrl)
      if (!res.ok) throw new Error(`Falha ao baixar (${res.status})`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${sanitizeFilename(clip.title)}.${extFromUrlOrType(mediaUrl, blob.type)}`
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

  const clearLongPress = () => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const onTilePointerDown = (clipId: string) => {
    longPressTriggered.current = false
    clearLongPress()
    longPressTimer.current = window.setTimeout(() => {
      longPressTriggered.current = true
      if (!selectMode) enterSelectMode(clipId)
      else togglePick(clipId)
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(12)
        } catch {
          /* ignore */
        }
      }
    }, 420)
  }

  const onTileClick = (clip: ClipRow) => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false
      return
    }
    if (selectMode) {
      togglePick(clip.id)
      return
    }
    setSelected(clip)
  }

  const selectedUrl = selected ? resolveClipMediaUrl(selected) : null
  const deleteCount = pendingDeleteIds?.length ?? 0
  const deleteTitle =
    deleteCount > 1
      ? `Excluir ${deleteCount} vídeos permanentemente?`
      : 'Excluir este vídeo permanentemente?'
  const deleteDescription =
    deleteCount > 1
      ? `Os ${deleteCount} vídeos selecionados serão excluídos permanentemente dos seus projetos e do armazenamento. Essa ação não pode ser desfeita — não será possível recuperar os arquivos.`
      : 'Este vídeo será excluído permanentemente dos seus projetos e do armazenamento. Essa ação não pode ser desfeita — não será possível recuperá-lo.'

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {selectMode
              ? pickedCount > 0
                ? `${pickedCount} selecionado${pickedCount === 1 ? '' : 's'}`
                : 'Selecionar'
              : 'Projetos'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {selectMode
              ? 'Toque para marcar · segure para selecionar'
              : 'Seus clips salvos'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {clips.length > 0 ? (
            selectMode ? (
              <>
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="press rounded-full bg-lift px-3 py-2 text-xs font-semibold text-ink ring-1 ring-white/10"
                >
                  {allSelected ? 'Limpar' : 'Todos'}
                </button>
                <button
                  type="button"
                  onClick={exitSelectMode}
                  className="press grid h-9 w-9 place-items-center rounded-full bg-lift text-muted ring-1 ring-white/10"
                  aria-label="Cancelar seleção"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => enterSelectMode()}
                  className="press grid h-9 w-9 place-items-center rounded-full bg-lift text-muted ring-1 ring-white/10"
                  aria-label="Selecionar"
                  title="Selecionar"
                >
                  <CheckSquare className="h-4 w-4" />
                </button>
                <Link
                  to="/criar"
                  className="press inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-2 text-xs font-semibold text-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Novo
                </Link>
              </>
            )
          ) : (
            <Link
              to="/criar"
              className="press inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-2 text-xs font-semibold text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo
            </Link>
          )}
        </div>
      </div>

      {selectMode ? (
        <div className="sticky top-0 z-30 -mx-1 flex items-center gap-2 rounded-2xl border border-white/10 bg-surface/95 px-3 py-2.5 backdrop-blur-md">
          <p className="min-w-0 flex-1 truncate text-sm text-muted">
            {pickedCount > 0
              ? `${pickedCount} vídeo${pickedCount === 1 ? '' : 's'}`
              : 'Selecione os vídeos'}
          </p>
          <Button
            type="button"
            variant="danger"
            className="!px-4 shrink-0"
            disabled={pickedCount === 0}
            onClick={() => setPendingDeleteIds([...picked])}
          >
            <Trash2 className="h-4 w-4" />
            Excluir
          </Button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-ink/10 border-t-accent" />
          Carregando…
        </div>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {!loading && clips.length === 0 ? (
        <div className="surface slide-up rounded-3xl px-6 py-14 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-lift text-muted">
            <Film className="h-6 w-6" />
          </span>
          <p className="mt-4 font-display text-lg font-bold">Nenhum projeto ainda</p>
          <p className="mt-1 text-sm text-muted">Crie seu primeiro clip em segundos.</p>
          <Link
            to="/criar"
            className="press mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-paper"
          >
            <Plus className="h-4 w-4" />
            Criar projeto
          </Link>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        {clips.map((clip) => {
          const mediaUrl = resolveClipMediaUrl(clip)
          const isPicked = picked.has(clip.id)
          return (
            <button
              key={clip.id}
              type="button"
              onClick={() => onTileClick(clip)}
              onPointerDown={() => onTilePointerDown(clip.id)}
              onPointerUp={clearLongPress}
              onPointerLeave={clearLongPress}
              onPointerCancel={clearLongPress}
              onContextMenu={(e) => {
                e.preventDefault()
                if (!selectMode) enterSelectMode(clip.id)
                else togglePick(clip.id)
              }}
              className={`surface press slide-up overflow-hidden rounded-2xl text-left transition ring-offset-2 ring-offset-paper ${
                selectMode && isPicked
                  ? 'ring-2 ring-accent'
                  : selectMode
                    ? 'ring-1 ring-white/10'
                    : ''
              }`}
            >
              <div className="relative aspect-[9/14] bg-canvas">
                {mediaUrl ? (
                  <ClipThumbnail src={mediaUrl} />
                ) : (
                  <div className="grid h-full place-items-center text-white/30">
                    <Film className="h-8 w-8" />
                  </div>
                )}
                {selectMode ? (
                  <span
                    className={`absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full ring-2 ${
                      isPicked
                        ? 'bg-accent text-white ring-accent'
                        : 'bg-black/45 text-transparent ring-white/80'
                    }`}
                    aria-hidden
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                ) : null}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-3 pt-10">
                  <p className="truncate text-sm font-semibold text-white">
                    {clip.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-white/65">
                    {formatPrecise((clip.end_seconds ?? 0) - clip.start_seconds)}
                    {clip.is_public ? ' · público' : ''}
                  </p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {selected && !selectMode ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Fechar"
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            onClick={() => setSelected(null)}
          />
          <div className="slide-up relative z-10 max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/8 bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-bold tracking-tight">
                  {selected.title}
                </p>
                <p className="text-xs text-muted">
                  {formatPrecise(
                    (selected.end_seconds ?? 0) - selected.start_seconds,
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="press grid h-9 w-9 shrink-0 place-items-center rounded-full bg-lift text-muted ring-1 ring-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {selectedUrl ? (
              <ClipPlayer
                src={selectedUrl}
                captions={selected.captions}
                aspectClassName="aspect-[9/16] max-h-[50dvh] w-full object-contain"
                autoPlay
              />
            ) : (
              <p className="rounded-2xl bg-mist px-4 py-8 text-center text-sm text-muted">
                Vídeo ainda não disponível.
              </p>
            )}

            <div className="mt-3 flex gap-2">
              {selectedUrl ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex-1"
                    loading={downloadingId === selected.id}
                    onClick={() => void download(selected)}
                  >
                    <Download className="h-4 w-4" />
                    Baixar
                  </Button>
                  <a
                    href={selectedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="press inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-lift py-3 text-sm font-semibold"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Abrir
                  </a>
                </>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                className="!px-3 text-danger"
                onClick={() => setPendingDeleteIds([selected.id])}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-3">
              <SharePanel
                clip={selected}
                onUpdated={(updated) => {
                  setSelected(updated)
                  setClips((prev) =>
                    prev.map((c) => (c.id === updated.id ? updated : c)),
                  )
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDeleteIds?.length)}
        title={deleteTitle}
        description={deleteDescription}
        confirmLabel={
          deleteCount > 1 ? `Excluir ${deleteCount} permanentemente` : 'Excluir permanentemente'
        }
        cancelLabel="Cancelar"
        danger
        loading={deleting}
        onCancel={() => {
          if (!deleting) setPendingDeleteIds(null)
        }}
        onConfirm={() => void confirmRemove()}
      />
    </div>
  )
}

function sanitizeFilename(name: string) {
  const cleaned = name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || 'clip'
  return cleaned.slice(0, 80)
}

function extFromUrlOrType(url: string, type: string) {
  if (type.includes('webm') || url.includes('.webm')) return 'webm'
  return 'mp4'
}
