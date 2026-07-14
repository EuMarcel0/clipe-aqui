import type { CaptionSegment } from '../types'

const MIN_DURATION = 0.4
const HOLD_PAD = 0.35
/** Hold curto só no fim da última legenda (não preencher até o fim do clip). */
const LAST_EXIT_PAD = 0.12
/** Lacunas menores que isso são preenchidas (mantém a legenda anterior até a próxima). */
const FILL_GAP = 1.35

/**
 * Quando a extração de áudio perde o começo do trecho, o Whisper marca a fala
 * cedo demais. Se o áudio ficou mais curto que o clip, deslocamos os timestamps.
 */
export function alignCaptionsToAudioDuration(
  segments: CaptionSegment[],
  clipDuration: number,
  audioDuration: number,
): CaptionSegment[] {
  if (!segments.length || clipDuration <= 0 || audioDuration <= 0) return segments

  const missingHead = clipDuration - audioDuration
  // Lag típico do MediaRecorder / seek incompleto no mobile
  if (missingHead >= 0.2 && missingHead <= 12) {
    return segments.map((s) => ({
      ...s,
      start: Math.max(0, s.start + missingHead),
      end: Math.max(0, s.end + missingHead),
    }))
  }

  return segments
}

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
    const isLast = !next
    let end = Math.max(cur.end, start + MIN_DURATION)

    if (isLast) {
      // Não esticar até o fim do vídeo — some perto do fim da fala
      end += LAST_EXIT_PAD
    } else {
      end += HOLD_PAD
      if (end >= next.start) {
        end = Math.max(start + MIN_DURATION, next.start - 0.04)
      } else if (next.start - end <= FILL_GAP) {
        end = next.start
      }
    }

    if (clipDuration > 0) {
      end = Math.min(end, clipDuration)
    }

    out.push({ start, end: Math.max(end, start + MIN_DURATION), text: cur.text })
  }

  if (clipDuration > 0) {
    return out.map((s) => ({
      ...s,
      start: Math.min(s.start, Math.max(0, clipDuration - MIN_DURATION)),
      end: Math.min(s.end, clipDuration),
    }))
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

  const t = Number.isFinite(time) ? time : 0
  // Fora do clip (antes do corte) = nenhuma legenda
  if (t < 0) return null

  const exact = list.find((c) => t >= c.start && t < c.end)
  if (exact) return exact

  // Só preenche lacunas ENTRE legendas (não antes da 1ª, não depois da última)
  for (let i = 0; i < list.length - 1; i++) {
    const cur = list[i]
    const next = list[i + 1]
    if (t >= cur.end && t < next.start && next.start - cur.end <= FILL_GAP) {
      return cur
    }
  }

  return null
}
