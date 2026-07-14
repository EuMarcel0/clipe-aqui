import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, Sparkles } from 'lucide-react'
import { Button } from '../components/Button'
import {
  CREDIT_PACKS,
  getBillingStatus,
  startCreditCheckout,
  type BillingStatus,
  type CreditPackId,
} from '../lib/billing'
import { getErrorMessage } from '../lib/errors'
import { useAuth } from '../hooks/useAuth'
import { useDocumentMeta } from '../hooks/useDocumentMeta'

export function BillingPage() {
  useDocumentMeta({
    title: 'Créditos e planos',
    description:
      'Compre créditos no Clipe Aqui para criar mais clips com legendas por IA e exportar Reels.',
    path: '/planos',
    noIndex: true,
  })
  const { user } = useAuth()
  const [params] = useSearchParams()
  const [status, setStatus] = useState<BillingStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [buying, setBuying] = useState<CreditPackId | null>(null)
  const [error, setError] = useState<string | null>(null)

  const checkout = params.get('checkout')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await getBillingStatus()
      setStatus(next)
    } catch (err) {
      setError(getErrorMessage(err, 'Não foi possível carregar seu saldo'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    void refresh()
  }, [user, refresh])

  useEffect(() => {
    if (checkout === 'success' && user) {
      const t = window.setTimeout(() => void refresh(), 1200)
      return () => window.clearTimeout(t)
    }
  }, [checkout, user, refresh])

  const buy = async (packId: CreditPackId) => {
    setBuying(packId)
    setError(null)
    try {
      await startCreditCheckout(packId)
    } catch (err) {
      setError(getErrorMessage(err, 'Falha ao abrir o Stripe Checkout'))
      setBuying(null)
    }
  }

  return (
    <div className="slide-up space-y-5 pb-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Créditos
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">
          Continuar clipando
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Grátis: 10 clips na vida da conta. Depois, 1 crédito = 1 clip salvo.
        </p>
      </div>

      {checkout === 'success' ? (
        <div className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-ink">
          Pagamento recebido. Seus créditos entram em alguns segundos — puxe para
          atualizar se ainda não aparecerem.
        </div>
      ) : null}
      {checkout === 'cancel' ? (
        <div className="rounded-2xl border border-white/10 bg-lift px-4 py-3 text-sm text-muted">
          Checkout cancelado. Nenhum valor foi cobrado.
        </div>
      ) : null}

      <div className="surface rounded-3xl p-5">
        {loading || !status ? (
          <div className="flex items-center gap-3 text-sm text-muted">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
            Carregando saldo…
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Grátis restantes" value={String(status.free_remaining)} />
            <Stat label="Créditos" value={String(status.credits)} />
            <Stat
              label="Já criados"
              value={`${status.lifetime_clips_created}`}
              className="col-span-2"
            />
          </div>
        )}
      </div>

      <div className="space-y-3">
        {CREDIT_PACKS.map((pack) => (
          <div
            key={pack.id}
            className={`rounded-3xl border p-4 ${
              pack.highlight
                ? 'border-accent/40 bg-accent/8'
                : 'border-white/10 bg-lift'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                {pack.highlight ? (
                  <p className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-accent">
                    <Sparkles className="h-3 w-3" />
                    Mais popular
                  </p>
                ) : null}
                <p className="font-display text-lg font-bold">{pack.label}</p>
                <p className="mt-0.5 text-sm text-muted">{pack.blurb}</p>
              </div>
              <p className="font-display text-xl font-bold text-ink">{pack.priceLabel}</p>
            </div>
            <Button
              type="button"
              className="mt-4 w-full"
              loading={buying === pack.id}
              disabled={Boolean(buying)}
              onClick={() => void buy(pack.id)}
            >
              Comprar
            </Button>
          </div>
        ))}
      </div>

      {error ? (
        <p className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Link
        to="/criar"
        className="press inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-lift px-4 py-3 text-sm font-semibold text-ink"
      >
        Voltar ao studio
      </Link>
    </div>
  )
}

function Stat({
  label,
  value,
  className = '',
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={`rounded-2xl bg-mist px-3 py-3 ${className}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p className="mt-1 flex items-center gap-1.5 font-display text-2xl font-bold">
        {value}
        {label === 'Créditos' && Number(value) > 0 ? (
          <Check className="h-4 w-4 text-accent" />
        ) : null}
      </p>
    </div>
  )
}
