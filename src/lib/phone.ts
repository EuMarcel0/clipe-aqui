/** Mantém só dígitos (Brasil: DDD + número). */
export function digitsOnly(value: string) {
  return value.replace(/\D/g, '').slice(0, 11)
}

/** Máscara (11) 99999-9999 / (11) 9999-9999 */
export function formatWhatsapp(value: string) {
  const d = digitsOnly(value)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  }
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function isValidWhatsapp(value: string) {
  const d = digitsOnly(value)
  return d.length === 10 || d.length === 11
}
