import { useEffect, useRef } from 'react'

/**
 * Reel cinematográfico gerado no canvas — fallback quando /hero.mp4 não existe.
 * Visual: frame 9:16, legendas queimadas, playhead, atmosfera de editor.
 */
export function HeroReelCanvas({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let start = performance.now()
    let running = true

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(window.innerWidth * dpr)
      canvas.height = Math.floor(window.innerHeight * dpr)
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const captions = [
      { t: 0, text: 'Corte o momento.' },
      { t: 2.2, text: 'Legende com IA.' },
      { t: 4.4, text: 'Exporte para Reels.' },
      { t: 6.6, text: 'Clipe Aqui.' },
    ]

    const draw = (now: number) => {
      if (!running) return
      const w = window.innerWidth
      const h = window.innerHeight
      const elapsed = ((now - start) / 1000) % 9

      // Fundo em movimento
      const g = ctx.createLinearGradient(0, 0, w, h)
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 0.7)
      g.addColorStop(0, `rgb(${8 + pulse * 10}, ${6}, ${12})`)
      g.addColorStop(0.45, `rgb(${18}, ${8 + pulse * 6}, ${22})`)
      g.addColorStop(1, `rgb(${6}, ${6}, ${8})`)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)

      // Glow coral
      const glow = ctx.createRadialGradient(
        w * (0.55 + 0.08 * Math.sin(elapsed * 0.5)),
        h * 0.35,
        40,
        w * 0.5,
        h * 0.4,
        Math.max(w, h) * 0.55,
      )
      glow.addColorStop(0, 'rgba(255,45,85,0.28)')
      glow.addColorStop(0.45, 'rgba(255,45,85,0.08)')
      glow.addColorStop(1, 'rgba(255,45,85,0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, w, h)

      // Frame do “app” 9:16
      const frameH = Math.min(h * 0.78, w * 1.15)
      const frameW = frameH * (9 / 16)
      const fx = (w - frameW) / 2
      const fy = (h - frameH) / 2 + h * 0.02

      // Sombra do phone
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.55)'
      ctx.shadowBlur = 40
      ctx.shadowOffsetY = 18
      roundRect(ctx, fx - 10, fy - 10, frameW + 20, frameH + 20, 28)
      ctx.fillStyle = '#0a0a0c'
      ctx.fill()
      ctx.restore()

      // Conteúdo interno com parallax
      const driftX = Math.sin(elapsed * 0.35) * 8
      const driftY = Math.cos(elapsed * 0.28) * 6
      ctx.save()
      roundRect(ctx, fx, fy, frameW, frameH, 22)
      ctx.clip()

      const ig = ctx.createLinearGradient(fx, fy, fx + frameW, fy + frameH)
      ig.addColorStop(0, '#1a1420')
      ig.addColorStop(0.5, '#2a1830')
      ig.addColorStop(1, '#120e18')
      ctx.fillStyle = ig
      ctx.fillRect(fx + driftX - 20, fy + driftY - 20, frameW + 40, frameH + 40)

      // Faixas de “vídeo”
      for (let i = 0; i < 6; i++) {
        const y = fy + ((elapsed * 40 + i * 90) % (frameH + 120)) - 60
        ctx.fillStyle = `rgba(255,255,255,${0.03 + (i % 2) * 0.02})`
        ctx.fillRect(fx, y, frameW, 48)
      }

      // Legenda ativa
      const active =
        [...captions].reverse().find((c) => elapsed % 9 >= c.t) ?? captions[0]
      const fontSize = Math.max(18, frameW * 0.07)
      ctx.font = `700 ${fontSize}px Outfit, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.lineWidth = fontSize * 0.14
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      ctx.fillStyle = '#fff'
      const ty = fy + frameH - frameH * 0.12
      ctx.strokeText(active.text, fx + frameW / 2, ty)
      ctx.fillText(active.text, fx + frameW / 2, ty)

      // Marca d'água
      ctx.globalAlpha = 0.75
      ctx.font = `600 ${Math.max(12, frameW * 0.045)}px "Plus Jakarta Sans", sans-serif`
      ctx.fillText('@clipeaqui', fx + frameW / 2, fy + frameH * 0.08)
      ctx.globalAlpha = 1

      // Timeline
      const barY = fy + frameH - 28
      const barX = fx + 18
      const barW = frameW - 36
      ctx.fillStyle = 'rgba(255,255,255,0.15)'
      roundRect(ctx, barX, barY, barW, 4, 2)
      ctx.fill()
      const progress = (elapsed % 9) / 9
      ctx.fillStyle = '#ff2d55'
      roundRect(ctx, barX, barY, barW * progress, 4, 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(barX + barW * progress, barY + 2, 6, 0, Math.PI * 2)
      ctx.fillStyle = '#fff'
      ctx.fill()

      ctx.restore()

      // Vinheta
      const vignette = ctx.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * 0.2,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.75,
      )
      vignette.addColorStop(0, 'rgba(0,0,0,0)')
      vignette.addColorStop(1, 'rgba(0,0,0,0.55)')
      ctx.fillStyle = vignette
      ctx.fillRect(0, 0, w, h)

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 h-full w-full ${className}`}
      aria-hidden
    />
  )
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}
