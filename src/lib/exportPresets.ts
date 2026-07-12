import type { ExportPreset } from '../types'

/** Padrão Reels / Shorts / TikTok / Kwai / YouTube Shorts */
export const REELS_FRAME = {
  width: 1080,
  height: 1920,
} as const

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
