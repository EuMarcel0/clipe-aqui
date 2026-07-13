import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/Button'
import { isSupabaseConfigured } from '../lib/supabase'
import { formatWhatsapp, isValidWhatsapp } from '../lib/phone'

export function AuthPage() {
  const { signIn, signUp, signInWithGoogle } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const switchMode = (next: 'login' | 'signup') => {
    setMode(next)
    setError(null)
    setInfo(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)

    if (mode === 'signup') {
      if (fullName.trim().length < 2) {
        setError('Informe seu nome completo.')
        return
      }
      if (!isValidWhatsapp(whatsapp)) {
        setError('Informe um WhatsApp válido com DDD (10 ou 11 dígitos).')
        return
      }
      if (password.length < 6) {
        setError('A senha precisa ter no mínimo 6 caracteres.')
        return
      }
      if (password !== confirmPassword) {
        setError('As senhas não coincidem.')
        return
      }
    }

    setLoading(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
      } else {
        const { needsEmailConfirm } = await signUp({
          email,
          password,
          fullName,
          whatsapp,
        })
        if (needsEmailConfirm) {
          setInfo(
            'Conta criada. Confirme o e-mail para entrar — seu perfil já fica registrado.',
          )
          setMode('login')
          setPassword('')
          setConfirmPassword('')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na autenticação')
    } finally {
      setLoading(false)
    }
  }

  const onGoogle = async () => {
    setError(null)
    setInfo(null)
    setGoogleLoading(true)
    try {
      await signInWithGoogle('/criar')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível iniciar o login com Google.',
      )
      setGoogleLoading(false)
    }
  }

  return (
    <div className="flex min-h-[78dvh] flex-col justify-center py-2">
      <section className="slide-up relative overflow-hidden rounded-3xl bg-canvas px-6 py-9 text-white">
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
            {mode === 'login' ? 'Bem-vindo de volta' : 'Crie sua conta'}
          </p>
          <p className="mt-4 max-w-[20rem] text-[15px] leading-relaxed text-white/65">
            {mode === 'login'
              ? 'Entre para cortar, legendar e exportar seus Reels.'
              : 'Cadastro rápido. WhatsApp ajuda a gente a te avisar quando precisar.'}
          </p>
        </div>
      </section>

      {!isSupabaseConfigured() ? (
        <p className="mt-4 rounded-2xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-ink/80">
          Configure <code>VITE_SUPABASE_*</code> no arquivo <code>.env</code>.
        </p>
      ) : null}

      <form
        onSubmit={(e) => void submit(e)}
        className="surface slide-up mt-5 space-y-3.5 rounded-3xl p-5"
      >
        <div className="flex gap-1 rounded-2xl bg-mist p-1">
          <ModeButton active={mode === 'login'} onClick={() => switchMode('login')}>
            Entrar
          </ModeButton>
          <ModeButton active={mode === 'signup'} onClick={() => switchMode('signup')}>
            Criar conta
          </ModeButton>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="w-full"
          loading={googleLoading}
          onClick={() => void onGoogle()}
        >
          <GoogleIcon />
          Continuar com Google
        </Button>

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-white/10" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
            ou
          </span>
          <span className="h-px flex-1 bg-white/10" />
        </div>

        {mode === 'signup' ? (
          <>
            <Field label="Nome completo">
              <input
                required
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="field mt-1.5"
                placeholder="Seu nome"
              />
            </Field>

            <Field label="WhatsApp">
              <input
                required
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(formatWhatsapp(e.target.value))}
                className="field mt-1.5"
                placeholder="(11) 99999-9999"
              />
            </Field>
          </>
        ) : null}

        <Field label="E-mail">
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field mt-1.5"
            placeholder="voce@email.com"
          />
        </Field>

        <Field label="Senha">
          <input
            required
            minLength={6}
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field mt-1.5"
            placeholder="mín. 6 caracteres"
          />
        </Field>

        {mode === 'signup' ? (
          <Field label="Confirmar senha">
            <input
              required
              minLength={6}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="field mt-1.5"
              placeholder="repita a senha"
            />
          </Field>
        ) : null}

        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {info ? <p className="text-sm text-accent">{info}</p> : null}

        <Button type="submit" className="w-full" loading={loading}>
          {mode === 'login' ? 'Entrar' : 'Criar conta'}
          <ArrowRight className="h-4 w-4" />
        </Button>

        {mode === 'signup' ? (
          <p className="text-center text-[11px] leading-relaxed text-muted">
            Ao criar a conta, você concorda em usar o Clipe Aqui para editar e exportar seus
            próprios vídeos.
          </p>
        ) : null}
      </form>

      <p className="mt-6 text-center text-xs text-muted">
        <Link className="font-semibold text-white/80 underline-offset-2 hover:underline" to="/">
          Voltar ao início
        </Link>
      </p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-ink/80">{label}{children}</label>
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
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
