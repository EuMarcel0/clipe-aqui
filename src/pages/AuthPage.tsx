import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'
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
        setInfo('Conta criada. Se o projeto exigir confirmação de e-mail, verifique sua caixa de entrada.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na autenticação')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[80dvh] flex-col justify-center">
      <section className="relative overflow-hidden rounded-[2rem] bg-ink px-5 py-8 text-paper shadow-[0_30px_80px_-40px_rgba(18,20,26,0.9)]">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/30 blur-2xl" />
        <div className="absolute -bottom-16 left-8 h-44 w-44 rounded-full bg-warn/25 blur-3xl" />

        <p className="font-display text-4xl font-extrabold leading-[0.95] tracking-tight sm:text-5xl">
          Clipe Aqui
        </p>
        <p className="mt-4 max-w-[18rem] text-sm leading-relaxed text-paper/70">
          Corte o momento, legende com IA e salve no S3 — feito para o celular.
        </p>

        <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs text-accent">
          <Sparkles className="h-3.5 w-3.5" />
          OpenAI gpt-4o-mini / whisper · ~US$ 0,006/min
        </div>
      </section>

      {!isSupabaseConfigured() ? (
        <p className="mt-4 rounded-2xl bg-warn/15 px-4 py-3 text-sm text-ink/80">
          Configure <code>VITE_SUPABASE_*</code> no arquivo <code>.env</code>.
        </p>
      ) : null}

      <form onSubmit={(e) => void submit(e)} className="glass mt-5 space-y-3 rounded-[1.75rem] p-5">
        <div className="flex gap-2 rounded-2xl bg-ink/5 p-1">
          <ModeButton active={mode === 'login'} onClick={() => setMode('login')}>
            Entrar
          </ModeButton>
          <ModeButton active={mode === 'signup'} onClick={() => setMode('signup')}>
            Criar conta
          </ModeButton>
        </div>

        <label className="block text-sm font-medium">
          E-mail
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-2xl border border-ink/10 bg-white px-3 py-3 outline-none ring-accent focus:ring-2"
            placeholder="voce@email.com"
          />
        </label>

        <label className="block text-sm font-medium">
          Senha
          <input
            required
            minLength={6}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-2xl border border-ink/10 bg-white px-3 py-3 outline-none ring-accent focus:ring-2"
            placeholder="mín. 6 caracteres"
          />
        </label>

        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {info ? <p className="text-sm text-accent-deep">{info}</p> : null}

        <Button type="submit" className="w-full" loading={loading}>
          {mode === 'login' ? 'Entrar no studio' : 'Criar e começar'}
          <ArrowRight className="h-4 w-4" />
        </Button>

        <p className="text-center text-xs text-ink/45">
          Ao continuar, você poderá clipar, legendar e compartilhar.
        </p>
      </form>

      <p className="mt-6 text-center text-xs text-ink/40">
        Já tem um link? Abra <Link className="underline" to="/s/demo">/s/seu-token</Link>
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
          ? 'flex-1 rounded-xl bg-ink py-2.5 text-sm font-semibold text-paper'
          : 'flex-1 rounded-xl py-2.5 text-sm font-semibold text-ink/55'
      }
    >
      {children}
    </button>
  )
}
