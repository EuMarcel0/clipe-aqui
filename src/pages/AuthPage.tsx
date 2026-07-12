import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/Button'
import { isSupabaseConfigured } from '../lib/supabase'

export function AuthPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
      } else {
        await signUp(email, password)
        setInfo('Conta criada. Se precisar confirmar o e-mail, verifique sua caixa de entrada.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na autenticação')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[78dvh] flex-col justify-center">
      <section className="slide-up relative overflow-hidden rounded-3xl bg-canvas px-6 py-10 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 80% 0%, rgba(255,45,85,0.35), transparent 55%), radial-gradient(ellipse 70% 50% at 10% 100%, rgba(255,45,85,0.12), transparent 50%)',
          }}
        />
        <div className="relative">
          <Link to="/" className="mb-5 inline-flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent font-display text-xs font-bold text-white">
              CA
            </span>
          </Link>
          <p className="font-display text-4xl font-extrabold leading-[0.95] tracking-tight sm:text-5xl">
            Clipe Aqui
          </p>
          <p className="mt-4 max-w-[17rem] text-[15px] leading-relaxed text-white/65">
            Corte, legende e exporte para Reels em poucos toques.
          </p>
        </div>
      </section>

      {!isSupabaseConfigured() ? (
        <p className="mt-4 rounded-2xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-ink/80">
          Configure <code>VITE_SUPABASE_*</code> no arquivo <code>.env</code>.
        </p>
      ) : null}

      <form onSubmit={(e) => void submit(e)} className="surface slide-up mt-5 space-y-4 rounded-3xl p-5">
        <div className="flex gap-1 rounded-2xl bg-mist p-1">
          <ModeButton active={mode === 'login'} onClick={() => setMode('login')}>
            Entrar
          </ModeButton>
          <ModeButton active={mode === 'signup'} onClick={() => setMode('signup')}>
            Criar conta
          </ModeButton>
        </div>

        <label className="block text-sm font-medium text-ink/80">
          E-mail
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field mt-1.5"
            placeholder="voce@email.com"
          />
        </label>

        <label className="block text-sm font-medium text-ink/80">
          Senha
          <input
            required
            minLength={6}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field mt-1.5"
            placeholder="mín. 6 caracteres"
          />
        </label>

        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {info ? <p className="text-sm text-accent-deep">{info}</p> : null}

        <Button type="submit" className="w-full" loading={loading}>
          {mode === 'login' ? 'Entrar' : 'Criar conta'}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-muted">
        Já tem um link? Abra{' '}
        <Link className="font-semibold text-white underline-offset-2 hover:underline" to="/s/demo">
          /s/seu-token
        </Link>
      </p>
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'flex-1 rounded-xl bg-lift py-2.5 text-sm font-semibold text-ink shadow-sm ring-1 ring-white/10'
          : 'flex-1 rounded-xl py-2.5 text-sm font-semibold text-muted'
      }
    >
      {children}
    </button>
  )
}
