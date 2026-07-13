export function getGitHubCopilotClientId(raw) {
  const value = String(raw || '').trim()
  if (!value || (!value.startsWith('{') && !value.startsWith('['))) return value

  const config = JSON.parse(value)
  if (!config || Array.isArray(config) || typeof config !== 'object') {
    throw new TypeError('GitHub Copilot config must be an object')
  }
  if (config.client_id !== undefined && typeof config.client_id !== 'string') {
    throw new TypeError('GitHub Copilot client_id must be a string')
  }
  return config.client_id?.trim() || ''
}
