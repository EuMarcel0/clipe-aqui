import clsx from 'clsx'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  loading?: boolean
}

export function Button({
  className,
  variant = 'primary',
  loading,
  disabled,
  children,
  ...props
}: Props) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' &&
          'bg-accent text-white shadow-[0_12px_28px_-14px_rgba(15,159,138,0.9)] hover:bg-accent-deep',
        variant === 'secondary' && 'bg-ink text-paper hover:bg-ink/90',
        variant === 'ghost' && 'bg-white/70 text-ink border border-ink/10 hover:bg-white',
        variant === 'danger' && 'bg-danger text-white',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      ) : null}
      {children}
    </button>
  )
}
