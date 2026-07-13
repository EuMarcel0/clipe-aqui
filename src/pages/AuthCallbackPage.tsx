import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { syncCurrentUser } from '../lib/users'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function finish() {
      const oauthError = params.get('error_description') || params.get('error')
      if (oauthError) {
        setError(decodeURIComponent(oauthError.replace(/\+/g, ' ')))
        return
      }

      const nextRaw = params.get('next') || '/criar'
      const next =
        nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/criar'

      // Aguarda a sessão (hash/query do OAuth)
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (cancelled) return

      if (sessionError) {
        setError(sessionError.message)
        return
      }

      if (!session) {
        // Tenta uma vez mais após o client processar o hash
        await new Promise((r) => setTimeout(r, 400))
        const again = await supabase.auth.getSession()
        if (cancelled) return
        if (!again.data.session) {
          setError('Não foi possível concluir o login com Google.')
          return
        }
      }

      await syncCurrentUser().catch((err) => {
        console.warn('syncCurrentUser após Google:', err)
      })

      if (!cancelled) navigate(next, { replace: true })
    }

    void finish()
    return () => {
      cancelled = true
    }
  }, [navigate, params])

  if (error) {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="font-display text-xl font-bold">Falha no Google</p>
        <p className="text-sm text-muted">{error}</p>
        <Link
          to="/auth"
          className="press rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white"
        >
          Voltar ao login
        </Link>
      </div>
    )
  }

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink/10 border-t-accent" />
      <p className="text-sm text-muted">Conectando com Google…</p>
    </div>
  )
}
