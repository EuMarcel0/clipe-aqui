export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatPrecise(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00.0'
  const m = Math.floor(seconds / 60)
  const s = (seconds % 60).toFixed(1)
  return `${m}:${s.padStart(4, '0')}`
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function estimateTranscriptionCostUsd(durationSeconds: number) {
  const COST_PER_MINUTE = 0.006
  return Number(((Math.max(durationSeconds, 1) / 60) * COST_PER_MINUTE).toFixed(6))
}

export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const el = document.createElement('textarea')
  el.value = text
  document.body.appendChild(el)
  el.select()
  document.execCommand('copy')
  document.body.removeChild(el)
}

export function segmentsToVtt(
  segments: Array<{ start: number; end: number; text: string }>,
): string {
  const lines = ['WEBVTT', '']
  segments.forEach((s, i) => {
    const text = s.text.trim()
    if (!text) return
    lines.push(String(i + 1))
    lines.push(`${formatVttTs(s.start)} --> ${formatVttTs(s.end)}`)
    lines.push(text)
    lines.push('')
  })
  return lines.join('\n')
}

function formatVttTs(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${String(ms).padStart(3, '0')}`
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}
