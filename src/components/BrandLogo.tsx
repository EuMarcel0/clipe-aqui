import clsx from 'clsx'

type BrandLogoProps = {
  className?: string
  /** Esconde do leitor de tela quando o texto "Clipe Aqui" já está ao lado */
  decorative?: boolean
}

/** Marca Clipe Aqui — filme + play + corte. */
export function BrandLogo({ className, decorative = true }: BrandLogoProps) {
  return (
    <svg
      className={clsx('shrink-0 text-accent', className ?? 'h-9 w-9')}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : 'img'}
    >
      {!decorative ? <title>Clipe Aqui</title> : null}
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <rect x="6" y="7" width="2.75" height="2.75" rx="0.7" fill="#fff" />
      <rect x="6" y="14.625" width="2.75" height="2.75" rx="0.7" fill="#fff" />
      <rect x="6" y="22.25" width="2.75" height="2.75" rx="0.7" fill="#fff" />
      <path
        d="M13.2 8.8c0-.55.6-.9 1.08-.62l10.1 6.05a.72.72 0 0 1 0 1.24l-10.1 6.05a.72.72 0 0 1-1.08-.62V8.8Z"
        fill="#fff"
      />
      <path d="M22.6 9.2 24.8 7" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M24.2 10.4 26.1 8.8"
        stroke="#fff"
        strokeWidth="1.35"
        strokeLinecap="round"
        opacity=".85"
      />
    </svg>
  )
}
