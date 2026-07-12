import { forwardRef } from 'react'
import clsx from 'clsx'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = 'primary', loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={clsx(
        'press inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold tracking-tight disabled:cursor-not-allowed disabled:opacity-45',
        variant === 'primary' && 'bg-accent text-white hover:bg-accent-deep',
        variant === 'secondary' && 'bg-white text-paper hover:bg-white/90',
        variant === 'ghost' &&
          'border border-white/10 bg-lift text-ink hover:bg-white/8',
        variant === 'danger' && 'bg-danger text-paper',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span
          className={clsx(
            'h-4 w-4 animate-spin rounded-full border-2 border-t-transparent',
            variant === 'ghost'
              ? 'border-white/25 border-t-ink'
              : variant === 'secondary'
                ? 'border-paper/30 border-t-paper'
                : 'border-white/30 border-t-white',
          )}
        />
      ) : null}
      {children}
    </button>
  )
})
