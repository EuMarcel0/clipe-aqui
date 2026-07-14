import type { CaptionSegment } from '../types'

const MIN_DURATION = 0.4
const HOLD_PAD = 0.35
/** Hold curto só no fim da última legenda (não preencher até o fim do clip). */
const LAST_EXIT_PAD = 0.12
/** Lacunas menores que isso são preenchidas (mantém a legenda anterior até a próxima). */
const FILL_GAP = 1.35

export type CaptionWord = {
  start: number
  end: number
  word: string
}

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
  // Threshold baixo: MediaRecorder costuma “comer” 80–300ms no seek
  if (missingHead >= 0.08 && missingHead <= 12) {
    return segments.map((s) => ({
      ...s,
      start: Math.max(0, s.start + missingHead),
      end: Math.max(0, s.end + missingHead),
    }))
  }

  return segments
}

/**
 * Ajusta starts/ends com timestamps por palavra (Whisper).
 * Corrige o caso clássico: 1ª legenda em 0.0 enquanto a fala começa depois.
 */
export function refineCaptionsWithWords(
  segments: CaptionSegment[],
  words: CaptionWord[] | null | undefined,
): CaptionSegment[] {
  if (!segments.length || !words?.length) return segments

  const usable = words
    .map((w) => ({
      start: Math.max(0, Number(w.start) || 0),
      end: Math.max(0, Number(w.end) || 0),
      word: String(w.word ?? '').trim(),
    }))
    .filter((w) => w.word.length > 0)
    .sort((a, b) => a.start - b.start)

  if (!usable.length) return segments

  return segments.map((seg, index) => {
    const segStart = Math.max(0, Number(seg.start) || 0)
    const segEnd = Math.max(segStart, Number(seg.end) || 0)

    // Palavras cujo centro cai dentro do segmento (com folga)
    const inSeg = usable.filter((w) => {
      const mid = (w.start + w.end) / 2
      return mid >= segStart - 0.15 && mid <= segEnd + 0.15
    })

    if (!inSeg.length) {
      // 1ª legenda sem palavras no range: usa a 1ª palavra global se o start era ~0
      if (index === 0 && segStart <= 0.12) {
        const firstWord = usable[0]
        if (firstWord.start > segStart + 0.05) {
          return {
            ...seg,
            start: firstWord.start,
            end: Math.max(segEnd, firstWord.end),
          }
        }
      }
      return seg
    }

    const start = inSeg[0].start
    const end = Math.max(inSeg[inSeg.length - 1].end, start + MIN_DURATION)
    return { ...seg, start, end }
  })
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
    // Nunca puxar o start para trás (1ª legenda aparecendo cedo demais)
    const start = cur.start
    const isLast = !next
    let end = Math.max(cur.end, start + MIN_DURATION)

    if (isLast) {
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
      // Só garante que start não passa do fim do clip — não altera timing cedo
      start: Math.min(s.start, Math.max(0, clipDuration - MIN_DURATION)),
      end: Math.min(Math.max(s.end, s.start + MIN_DURATION), clipDuration),
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
