import type { CaptionSegment } from '../types'

const MIN_DURATION = 0.4
const HOLD_PAD = 0.45
/** Lacunas menores que isso são preenchidas (mantém a legenda anterior até a próxima). */
const FILL_GAP = 1.35

/**
 * Ajusta timestamps do Whisper para evitar “buracos” em que a fala continua
 * e a legenda some cedo demais.
 */
export function normalizeCaptionSegments(
  segments: CaptionSegment[],
  clipDuration = 0,
): CaptionSegment[] {
  const cleaned = segments
    .map((s) => ({
      start: Math.max(0, Number(s.start) || 0),
      end: Math.max(0, Number(s.end) || 0),
      text: String(s.text ?? '').trim(),
    }))
    .filter((s) => s.text.length > 0)
    .sort((a, b) => a.start - b.start)

  if (cleaned.length === 0) return []

  const out: CaptionSegment[] = []

  for (let i = 0; i < cleaned.length; i++) {
    const cur = cleaned[i]
    const next = cleaned[i + 1]
    const start = cur.start
    let end = Math.max(cur.end, start + MIN_DURATION) + HOLD_PAD

    if (next) {
      if (end >= next.start) {
        end = Math.max(start + MIN_DURATION, next.start - 0.04)
      } else if (next.start - end <= FILL_GAP) {
        // Preenche gap curto: mantém texto até a próxima fala
        end = next.start
      }
    } else if (clipDuration > 0) {
      // Último segmento: segura um pouco mais, sem forçar o clip inteiro
      // se o Whisper terminou muito cedo.
      const remain = clipDuration - end
      if (remain > 0) {
        const extra =
          cleaned.length === 1
            ? Math.min(remain - 0.05, Math.max(1.2, clipDuration * 0.35))
            : Math.min(remain - 0.05, 1.6)
        if (extra > 0) end += extra
      }
      end = Math.min(end, Math.max(start + MIN_DURATION, clipDuration - 0.05))
    }

    out.push({ start, end: Math.max(end, start + MIN_DURATION), text: cur.text })
  }

  return out
}

/** Qual legenda deve aparecer em um tempo do clip (segundos desde o início do corte). */
export function getActiveCaptionAt(
  segments: CaptionSegment[] | null | undefined,
  time: number,
): CaptionSegment | null {
  const list = Array.isArray(segments) ? segments : []
  if (list.length === 0) return null

  const t = Number.isFinite(time) ? Math.max(0, time) : 0

  const exact = list.find((c) => t >= c.start && t < c.end)
  if (exact) return exact

  // Inclusive no fim (último frame / arredondamento)
  const atEnd = list.find((c) => t >= c.start && t <= c.end + 0.08)
  if (atEnd) return atEnd

  // Segura a anterior em gaps curtos
  for (let i = 0; i < list.length - 1; i++) {
    const cur = list[i]
    const next = list[i + 1]
    if (t >= cur.end && t < next.start && next.start - cur.end <= FILL_GAP) {
      return cur
    }
  }

  return null
}
