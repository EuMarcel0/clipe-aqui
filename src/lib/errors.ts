export function getErrorMessage(err: unknown, fallback = 'Algo deu errado. Tente novamente.') {
  if (!err) return fallback
  if (typeof err === 'string' && err.trim()) return err
  if (err instanceof Error && err.message.trim()) return err.message

  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>

    if (typeof obj.message === 'string' && obj.message.trim()) {
      return obj.message
    }

    if (typeof obj.error === 'string' && obj.error.trim()) {
      return obj.error
    }

    if (obj.error && typeof obj.error === 'object') {
      const nested = obj.error as Record<string, unknown>
      if (typeof nested.message === 'string' && nested.message.trim()) {
        return nested.message
      }
    }

    if (typeof obj.msg === 'string' && obj.msg.trim()) {
      return obj.msg
    }

    try {
      const raw = JSON.stringify(err)
      if (raw && raw !== '{}') return raw.slice(0, 240)
    } catch {
      // ignore
    }
  }

  return fallback
}
