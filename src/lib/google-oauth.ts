import { supabase } from './supabase'

/** URL do app após o OAuth (precisa estar em Redirect URLs do Supabase). */
export function getAppOrigin() {
  const fromEnv = import.meta.env.VITE_APP_URL?.replace(/\/$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return fromEnv || 'http://localhost:5173'
}

export function getAuthCallbackUrl(next = '/criar') {
  const url = new URL('/auth/callback', `${getAppOrigin()}/`)
  if (next.startsWith('/') && !next.startsWith('//')) {
    url.searchParams.set('next', next)
  }
  return url.toString()
}

/**
 * URI cadastrada no Google Cloud Console → Authorized redirect URIs.
 * Aponta para o Supabase, não para o Vite.
 */
export function getSupabaseGoogleRedirectUri() {
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(
    /\/$/,
    '',
  )
  if (!base) return ''
  return `${base}/auth/v1/callback`
}

export async function signInWithGoogle(next = '/criar') {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getAuthCallbackUrl(next),
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account',
      },
    },
  })
}
