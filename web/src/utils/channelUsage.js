import i18n from 'i18n/i18n'

export const CHANNEL_TYPE_CLAUDE_CODE = 58
export const CHANNEL_TYPE_CODEX = 59
export const CHANNEL_TYPE_GITHUB_COPILOT = 64
export const CHANNEL_TYPE_OPEN_CODE = 65
export const DEFAULT_USAGE_CACHE_TTL_MS = 5 * 60 * 1000

const usageMemoryCache = new Map()

function getCacheKey(key) {
  return `channel_usage:${key}`
}

function readUsageCache(key) {
  const now = Date.now()
  const memoryValue = usageMemoryCache.get(key)
  if (memoryValue && memoryValue.expiresAt > now) {
    return memoryValue.value
  }

  try {
    const rawValue = sessionStorage.getItem(getCacheKey(key))
    if (!rawValue) return null
    const parsedValue = JSON.parse(rawValue)
    if (!parsedValue?.expiresAt || parsedValue.expiresAt <= now) {
      sessionStorage.removeItem(getCacheKey(key))
      return null
    }
    usageMemoryCache.set(key, parsedValue)
    return parsedValue.value
  } catch (error) {
    return null
  }
}

function getResponseCacheTTL(value) {
  const ttlSeconds = Number(value?.data?.data?.cache_ttl_seconds || value?.data?.cache_ttl_seconds)
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) return DEFAULT_USAGE_CACHE_TTL_MS
  return Math.max(1000, ttlSeconds * 1000)
}

function writeUsageCache(key, value) {
  const now = Date.now()
  const cacheValue = {
    savedAt: now,
    expiresAt: now + getResponseCacheTTL(value),
    value
  }
  usageMemoryCache.set(key, cacheValue)
  try {
    sessionStorage.setItem(getCacheKey(key), JSON.stringify(cacheValue))
  } catch (error) {
    // Ignore storage quota/private mode failures; memory cache still protects the current page.
  }
}

export async function getCachedUsage(key, fetcher) {
  const cachedValue = readUsageCache(key)
  if (cachedValue) return cachedValue

  const value = await fetcher()
  writeUsageCache(key, value)
  return value
}

export function clearUsageCache() {
  usageMemoryCache.clear()
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith('channel_usage:'))
      .forEach((key) => sessionStorage.removeItem(key))
  } catch (error) {
    // Ignore storage access failures; the in-memory cache has already been cleared.
  }
}

export function supportsUsageWindows(type) {
  return [CHANNEL_TYPE_CLAUDE_CODE, CHANNEL_TYPE_CODEX, CHANNEL_TYPE_GITHUB_COPILOT, CHANNEL_TYPE_OPEN_CODE].includes(Number(type))
}

export function clampPercent(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(100, number))
}

export function formatUsagePercent(value) {
  const rounded = Math.round(clampPercent(value))
  return `${rounded}%`
}

export function formatResetAt(value, unit = 'ms') {
  if (!value) return i18n.t('channel_usage.unknown')
  const date = new Date(unit === 'seconds' ? Number(value) * 1000 : value)
  if (Number.isNaN(date.getTime())) return i18n.t('channel_usage.unknown')
  const localeMap = { zh_CN: 'zh-CN', zh_HK: 'zh-HK', en_US: 'en-US', ja_JP: 'ja-JP' }
  const language = i18n.resolvedLanguage || i18n.language
  return date.toLocaleString(localeMap[language] || language || undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function getWindowLabel(seconds) {
  const minutes = Number(seconds || 0) / 60
  if (Math.abs(minutes - 300) <= 15) return '5h'
  if (Math.abs(minutes - 10080) <= 504) return '7d'
  if (Math.abs(minutes - 1440) <= 72) return '1d'
  if (minutes >= 60) return `${Math.round(minutes / 60)}h`
  if (minutes > 0) return `${Math.round(minutes)}m`
  return i18n.t('channel_usage.windowQuota')
}

function buildWindow(key, label, used, resetsAt, resetUnit = 'ms') {
  const usedPercent = clampPercent(used)
  return {
    key,
    label,
    usedPercent,
    remainingPercent: clampPercent(100 - usedPercent),
    resetsAt,
    resetUnit
  }
}

export function parseUsageWindows(type, usage) {
  const channelType = Number(type)
  if (!usage || typeof usage !== 'object') return []

  if (channelType === CHANNEL_TYPE_CLAUDE_CODE) {
    return [
      usage.five_hour && buildWindow('five_hour', '5h', usage.five_hour.utilization, usage.five_hour.resets_at),
      usage.seven_day && buildWindow('seven_day', '7d', usage.seven_day.utilization, usage.seven_day.resets_at)
    ].filter(Boolean)
  }

  if (channelType === CHANNEL_TYPE_CODEX) {
    const primary = usage.rate_limit?.primary_window
    const secondary = usage.rate_limit?.secondary_window
    return [
      primary && buildWindow('primary', getWindowLabel(primary.limit_window_seconds), primary.used_percent, primary.reset_at, 'seconds'),
      secondary && buildWindow('secondary', getWindowLabel(secondary.limit_window_seconds), secondary.used_percent, secondary.reset_at, 'seconds')
    ].filter(Boolean)
  }

  if (channelType === CHANNEL_TYPE_GITHUB_COPILOT) {
    const snapshots = usage.quota_snapshots || {}
    const resetAt = usage.quota_reset_date_utc || usage.quota_reset_date || usage.limited_user_reset_date
    const snapshotWindows = [
      ['premium_interactions', i18n.t('channel_usage.windowPremium')],
      ['chat', i18n.t('channel_usage.windowChat')],
      ['completions', i18n.t('channel_usage.windowCompletions')]
    ].map(([key, label]) => {
      const snapshot = snapshots[key]
      if (!snapshot) return null
      if (snapshot.unlimited === true || Number(snapshot.entitlement) < 0) {
        return buildWindow(key, `${label} ∞`, 0, snapshot.quota_reset_at || resetAt, snapshot.quota_reset_at ? 'seconds' : 'ms')
      }
      const remainingPercent = Number.isFinite(Number(snapshot.percent_remaining))
        ? Number(snapshot.percent_remaining)
        : Number(snapshot.entitlement) > 0
          ? Number(snapshot.remaining ?? snapshot.quota_remaining ?? 0) / Number(snapshot.entitlement) * 100
          : null
      if (!Number.isFinite(remainingPercent)) return null
      return buildWindow(key, label, 100 - remainingPercent, snapshot.quota_reset_at || resetAt, snapshot.quota_reset_at ? 'seconds' : 'ms')
    }).filter(Boolean)
    if (snapshotWindows.length) return snapshotWindows

    const remaining = usage.limited_user_quotas || {}
    const monthly = usage.monthly_quotas || {}
    return ['chat', 'completions'].map((key) => {
      const entitlement = Number(monthly[key])
      const quotaRemaining = Number(remaining[key])
      if (!Number.isFinite(entitlement) || entitlement <= 0 || !Number.isFinite(quotaRemaining)) return null
      const resetUnit = typeof resetAt === 'number' && resetAt < 1e12 ? 'seconds' : 'ms'
      return buildWindow(`limited_${key}`, key === 'chat' ? i18n.t('channel_usage.windowChat') : i18n.t('channel_usage.windowCompletions'), 100 - quotaRemaining / entitlement * 100, resetAt, resetUnit)
    }).filter(Boolean)
  }

  if (channelType === CHANNEL_TYPE_OPEN_CODE) {
    return (usage.windows || []).map((window, index) => buildWindow(
      window.key || `window_${index}`,
      window.label === 'Monthly' ? i18n.t('channel_usage.windowMonthly') : window.label || i18n.t('channel_usage.windowQuota'),
      window.used_percent,
      window.reset_at,
      'seconds'
    ))
  }

  return []
}

export function getUsageSummaryLabel(windows) {
  if (!windows?.length) return i18n.t('channel_usage.noWindow')
  return windows.map((window) => `${window.label} ${formatUsagePercent(window.remainingPercent)}`).join(' / ')
}
