export function parseOpenCodeCredentials(raw) {
  const value = String(raw || '').trim()
  if (!value) return { apiKey: '', authCookie: '', valid: true }
  if (!value.startsWith('{')) return { apiKey: value, authCookie: '', valid: true }

  try {
    const credentials = JSON.parse(value)
    if (!credentials || Array.isArray(credentials) || typeof credentials !== 'object') {
      return { apiKey: '', authCookie: '', valid: false }
    }
    if ((credentials.api_key !== undefined && typeof credentials.api_key !== 'string') ||
        (credentials.auth_cookie !== undefined && typeof credentials.auth_cookie !== 'string')) {
      return { apiKey: '', authCookie: '', valid: false }
    }
    return {
      apiKey: credentials.api_key || '',
      authCookie: credentials.auth_cookie || '',
      valid: true
    }
  } catch {
    return { apiKey: '', authCookie: '', valid: false }
  }
}

export function buildOpenCodeCredentials(apiKey, authCookie) {
  return JSON.stringify({ api_key: apiKey || '', auth_cookie: authCookie || '' })
}
