import { supabase } from './supabase'

export const FREE_LIFETIME_CLIPS = 10

export type BillingStatus = {
  free_limit: number
  lifetime_clips_created: number
  free_remaining: number
  credits: number
  can_create: boolean
}

export type CreditPackId = 'pack_10' | 'pack_20' | 'pack_50' | 'pack_100'

export type CreditPack = {
  id: CreditPackId
  credits: number
  label: string
  blurb: string
  /** Preço de exibição (BRL). Cobrança real vem do Price no Stripe. */
  priceLabel: string
  highlight?: boolean
}

export const CREDIT_PACKS: CreditPack[] = [
  {
    id: 'pack_10',
    credits: 10,
    label: '10 créditos',
    blurb: 'Pacote inicial',
    priceLabel: 'R$ 9,99',
  },
  {
    id: 'pack_20',
    credits: 20,
    label: '20 créditos',
    blurb: 'Para começar a postar com frequência',
    priceLabel: 'R$ 18,99',
  },
  {
    id: 'pack_50',
    credits: 50,
    label: '50 créditos',
    blurb: 'Melhor custo por clip',
    priceLabel: 'R$ 38,99',
    highlight: true,
  },
  {
    id: 'pack_100',
    credits: 100,
    label: '100 créditos',
    blurb: 'Para quem publica todo dia',
    priceLabel: 'R$ 68,99',
  },
]

export async function getBillingStatus(): Promise<BillingStatus> {
  const { data, error } = await supabase.rpc('get_billing_status')
  if (error) throw error
  const row = data as BillingStatus
  return {
    free_limit: Number(row.free_limit ?? FREE_LIFETIME_CLIPS),
    lifetime_clips_created: Number(row.lifetime_clips_created ?? 0),
    free_remaining: Number(row.free_remaining ?? 0),
    credits: Number(row.credits ?? 0),
    can_create: Boolean(row.can_create),
  }
}

export async function startCreditCheckout(packId: CreditPackId) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Faça login para comprar créditos')

  const base = import.meta.env.VITE_SUPABASE_URL
  const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  const appUrl = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '')

  const res = await fetch(`${base}/functions/v1/create-checkout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      packId,
      successUrl: `${appUrl}/planos?checkout=success`,
      cancelUrl: `${appUrl}/planos?checkout=cancel`,
    }),
  })

  const payload = (await res.json().catch(() => ({}))) as {
    url?: string
    error?: string
  }

  if (!res.ok || !payload.url) {
    throw new Error(payload.error || 'Não foi possível abrir o checkout')
  }

  window.location.assign(payload.url)
}

export function isQuotaExceededError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return /QUOTA_EXCEEDED|Limite grátis|créditos/i.test(msg)
}
