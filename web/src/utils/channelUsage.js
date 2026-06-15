export const CHANNEL_TYPE_CLAUDE_CODE = 58
export const CHANNEL_TYPE_CODEX = 59
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

export function supportsUsageWindows(type) {
  return [CHANNEL_TYPE_CLAUDE_CODE, CHANNEL_TYPE_CODEX].includes(Number(type))
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
  if (!value) return '未知'
  const date = new Date(unit === 'seconds' ? Number(value) * 1000 : value)
  if (Number.isNaN(date.getTime())) return '未知'
  return date.toLocaleString('zh-CN', {
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
  return '额度'
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

  return []
}

export function getUsageSummaryLabel(windows) {
  if (!windows?.length) return '暂无窗口'
  return windows.map((window) => `${window.label} ${formatUsagePercent(window.remainingPercent)}`).join(' / ')
}
