export function maskSensitiveText(value: any, options: { head?: number; tail?: number; mask?: string } = {}): string {
  const text = String(value || '')
  if (!text) return ''

  const head = options.head ?? 2
  const tail = options.tail ?? 2
  const mask = options.mask || '******'

  if (text.length <= head + tail) {
    return text.length <= 2 ? '*'.repeat(text.length) : `${text.slice(0, 1)}${mask}${text.slice(-1)}`
  }

  return `${text.slice(0, head)}${mask}${text.slice(-tail)}`
}

export function maskPassword(value: any): string {
  const text = String(value || '')
  if (!text) return ''
  return text.length <= 4 ? '****' : `${text.slice(0, 1)}******${text.slice(-1)}`
}

export function maskAccount(value: any): string {
  return maskSensitiveText(value, { head: 3, tail: 3, mask: '****' })
}

export function maskEmail(value: any): string {
  const text = String(value || '')
  if (!text || !text.includes('@')) return maskSensitiveText(text, { head: 2, tail: 2, mask: '****' })

  const [name, domain] = text.split('@')
  return `${maskSensitiveText(name, { head: 2, tail: 1, mask: '***' })}@${domain}`
}
