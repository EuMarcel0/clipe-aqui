import type { ExportPreset } from '../types'

/** Padrão Reels / Shorts / TikTok / Kwai / YouTube Shorts */
export const REELS_FRAME = {
  width: 1080,
  height: 1920,
} as const

/** Resolução usada no export no browser (mais leve no celular). */
export function getReelsExportFrame() {
  const mobile =
    typeof navigator !== 'undefined' &&
    (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 1 && window.innerWidth < 900))
  const lowMem =
    typeof navigator !== 'undefined' &&
    'deviceMemory' in navigator &&
    typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory === 'number' &&
    ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4

  if (mobile || lowMem) {
    return { width: 720, height: 1280 } as const
  }
  return REELS_FRAME
}

export function exportPresetLabel(preset: ExportPreset) {
  return preset === 'reels' ? 'Vídeo para Reels' : 'Vídeo normal'
}

/** Desenha o frame cobrindo o destino 9:16 (crop central), sem barras. */
export function drawCoverFrame(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
) {
  const scale = Math.max(dstW / srcW, dstH / srcH)
  const dw = srcW * scale
  const dh = srcH * scale
  const dx = (dstW - dw) / 2
  const dy = (dstH - dh) / 2
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, dstW, dstH)
  ctx.drawImage(source, dx, dy, dw, dh)
}
