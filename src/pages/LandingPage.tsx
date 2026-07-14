import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useDocumentMeta, SITE_DESCRIPTION } from '../hooks/useDocumentMeta'
import { BrandLogo } from '../components/BrandLogo'
import { HeroReelCanvas } from '../components/HeroReelCanvas'

export function LandingPage() {
  const { user } = useAuth()
  // const [videoOk, setVideoOk] = useState(false)
  const [ready, setReady] = useState(false)
  const startTo = user ? '/criar' : '/auth'

  useDocumentMeta({
    title: 'Clipe Aqui — Corte, legendas com IA e export para Reels',
    description: SITE_DESCRIPTION,
    path: '/',
  })

  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 40)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <div className="bg-paper text-ink">
      {/* —— HERO full-bleed —— */}
      <section className="relative isolate min-h-dvh overflow-hidden">
        {/* Mídia dominante */}
        <div className="absolute inset-0">
          {/*
            Hero com narração (personagem + TTS) — pausado por enquanto.
            Assets em public/hero.mp4 e public/hero-assets/ (narration.mp3, person.png, script.txt).
            Descomentar o <video> abaixo e o estado videoOk quando quiser reativar.
          <video
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
              videoOk ? 'opacity-100' : 'opacity-0'
            }`}
            src="/hero.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            onCanPlay={() => setVideoOk(true)}
            onError={() => setVideoOk(false)}
          />
          {!videoOk ? <HeroReelCanvas /> : null}
          */}
          <HeroReelCanvas />
          {/* Scrim só para legibilidade tipográfica */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(5,5,6,0.55) 0%, rgba(5,5,6,0.25) 38%, rgba(5,5,6,0.72) 100%)',
            }}
          />
        </div>

        {/* Nav mínima */}
        <header
          className={`relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 pt-5 sm:px-8 sm:pt-7 transition-all duration-700 ${
            ready ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0'
          }`}
        >
          <Link to="/" className="flex items-center gap-2.5">
            <BrandLogo className="h-9 w-9" />
            <span className="font-display text-lg font-bold tracking-tight sm:text-xl">
              Clipe Aqui
            </span>
          </Link>
          <Link
            to={user ? '/criar' : '/auth'}
            className="press rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white/90 backdrop-blur-md hover:bg-white/10"
          >
            {user ? 'Abrir studio' : 'Entrar'}
          </Link>
        </header>

        {/* Conteúdo do hero — brand first */}
        <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-4.5rem)] w-full max-w-6xl flex-col justify-end px-5 pb-16 sm:px-8 sm:pb-20">
          <div
            className={`max-w-xl transition-all duration-1000 delay-150 ${
              ready ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            }`}
          >
            <p className="font-display text-[clamp(3.25rem,12vw,6.5rem)] font-extrabold leading-[0.9] tracking-[-0.04em] text-white">
              Clipe Aqui
            </p>
            <h1 className="mt-5 max-w-[22ch] font-display text-[clamp(1.35rem,3.8vw,2.15rem)] font-semibold leading-tight tracking-tight text-white/95">
              Do vídeo bruto ao Reels: corte, legendas com IA e export no celular.
            </h1>
            <p className="mt-4 max-w-[40ch] text-[15px] leading-relaxed text-white/65 sm:text-base">
              Transforme vídeos longos em clips verticais prontos para TikTok, Instagram Reels e
              YouTube Shorts — com legendas automáticas e marca d’água.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to={startTo}
                className="press inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3.5 text-sm font-semibold text-white shadow-[0_16px_40px_-16px_rgba(255,45,85,0.9)] hover:bg-accent-deep"
              >
                Começar grátis
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#fluxo"
                className="press inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-md hover:bg-white/10"
              >
                Ver o fluxo
              </a>
            </div>
          </div>
        </div>

        {/* Indicador de scroll */}
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center transition-opacity delay-700 duration-700 ${
            ready ? 'opacity-50' : 'opacity-0'
          }`}
        >
          <span className="h-8 w-px animate-pulse-soft bg-gradient-to-b from-transparent via-white/70 to-transparent" />
        </div>
      </section>

      {/* —— Seção 2: um propósito —— */}
      <section
        id="fluxo"
        className="relative overflow-hidden border-t border-white/6 px-5 py-24 sm:px-8 sm:py-32"
      >
        <div
          className="pointer-events-none absolute -right-24 top-0 h-72 w-72 rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(255,45,85,0.35), transparent 70%)' }}
        />
        <div className="relative mx-auto max-w-6xl">
          <p className="font-display text-[clamp(2rem,5vw,3.5rem)] font-bold leading-[1.05] tracking-tight">
            Três gestos.
            <br />
            <span className="text-accent">Um clip pronto.</span>
          </p>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted">
            Importe o vídeo, marque o trecho e deixe a IA escrever as legendas. Salve em 9:16 e
            compartilhe.
          </p>

          <ol className="mt-14 grid gap-10 sm:grid-cols-3 sm:gap-8">
            {[
              { n: '01', t: 'Corte', d: 'Arraste início e fim. Prévia na hora.' },
              { n: '02', t: 'Legende', d: 'Whisper gera o texto. Você edita se quiser.' },
              { n: '03', t: 'Exporte', d: 'Reels 9:16 ou resolução original.' },
            ].map((step, i) => (
              <li
                key={step.n}
                className="reveal-step"
                style={{ animationDelay: `${0.12 + i * 0.1}s` }}
              >
                <p className="font-display text-sm font-semibold tracking-[0.2em] text-accent">
                  {step.n}
                </p>
                <p className="mt-3 font-display text-2xl font-bold tracking-tight">{step.t}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.d}</p>
              </li>
            ))}
          </ol>

          <div className="mt-16">
            <Link
              to={startTo}
              className="press inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-paper hover:bg-white/90"
            >
              Abrir Clipe Aqui
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/6 px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <BrandLogo className="h-7 w-7" />
            <span className="font-display text-sm font-bold">Clipe Aqui</span>
          </div>
          <p className="text-xs text-muted">Corte · legende · compartilhe</p>
        </div>
      </footer>
    </div>
  )
}

