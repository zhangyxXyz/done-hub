import { useEffect, useMemo, useState } from 'react'
import { Box, CircularProgress, Divider, LinearProgress, Stack, Tooltip, Typography } from '@mui/material'
import SubCard from 'ui-component/cards/SubCard'
import { API } from 'utils/api'
import {
  formatResetAt,
  formatUsagePercent,
  getCachedUsage,
  parseUsageWindows
} from 'utils/channelUsage'
import { useTranslation } from 'react-i18next'

function providerName(type) {
  switch (Number(type)) {
    case 58:
      return 'ClaudeCode'
    case 59:
      return 'Codex'
    case 64:
      return 'GitHub Copilot'
    case 65:
      return 'OpenCode Go'
    default:
      return 'OAuth'
  }
}

export default function ChannelQuotaPanel() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])

  useEffect(() => {
    let ignore = false

    const load = async() => {
      setLoading(true)
      try {
        const res = await getCachedUsage('dashboard:channels:12:copilot-v1', () => API.get('/api/channel/usage', { params: { limit: 12 } }))
        const usageItems = res.data.success
          ? (res.data.data?.items || []).filter((item) => item.enabled !== false && item.channel?.enable_usage_query !== false)
          : []
        if (!ignore) setItems(usageItems)
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    load()
    return () => {
      ignore = true
    }
  }, [])

  const visibleItems = useMemo(() => items.filter((item) => item.error || item.data), [items])

  return (
    <SubCard
      title={t('channel_usage.panelTitle')}
      contentSX={{ p: 2 }}
    >
      {loading && (
        <Stack direction="row" spacing={1} alignItems="center">
          <CircularProgress size={16}/>
          <Typography variant="body2" color="text.secondary">{t('channel_usage.loading')}</Typography>
        </Stack>
      )}

      {!loading && visibleItems.length === 0 && (
        <Typography variant="body2" color="text.secondary">{t('channel_usage.noProviderData')}</Typography>
      )}

      {!loading && visibleItems.map((item, index) => {
        const windows = parseUsageWindows(item.channel.type, item.data?.usage)
        const empty = item.data?.empty || (!item.error && windows.length === 0)
        const usageColor = item.error ? 'error.main' : empty ? 'warning.main' : 'primary.main'
        const tooltip = item.error ? (
          item.error
        ) : (
          <Box>
            {empty ? (
              <Typography variant="body2">{item.data?.warning || t('channel_usage.noActiveWindow')}</Typography>
            ) : (
              windows.map((window) => (
                <Typography key={window.key} variant="body2">
                  {t('channel_usage.windowDetail', { label: window.label, used: formatUsagePercent(window.usedPercent), remaining: formatUsagePercent(window.remainingPercent), reset: formatResetAt(window.resetsAt, window.resetUnit) })}
                </Typography>
              ))
            )}
          </Box>
        )

        return (
          <Box key={`${item.channel.type}-${item.channel.id}`}>
            {index > 0 && <Divider sx={{ my: 1.25 }}/>}
            <Tooltip title={tooltip} arrow placement="top">
              <Box sx={{ cursor: 'help' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mb: !item.error && !empty ? 1.25 : 0 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }} noWrap>
                      {item.channel.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {providerName(item.channel.type)} · #{item.channel.id}
                    </Typography>
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{
                      color: usageColor,
                      fontWeight: 800,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {item.error ? t('channel_usage.failed') : empty ? t('channel_usage.noWindow') : t('channel_usage.windowCount', { count: windows.length })}
                  </Typography>
                </Stack>
                {!item.error && !empty && (
                  <Stack spacing={1.1}>
                    {windows.map((window) => {
                      const unlimited = window.label.endsWith(' ∞')
                      const label = unlimited ? window.label.slice(0, -2) : window.label
                      const remaining = window.remainingPercent
                      const barColor = remaining < 20 ? 'error.main' : remaining < 50 ? 'warning.main' : 'primary.main'
                      return (
                        <Box key={window.key}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                            <Typography variant="caption" sx={{ fontWeight: 800 }}>{label}</Typography>
                            <Typography variant="caption" sx={{ color: barColor, fontWeight: 800 }}>
                              {unlimited ? t('channel_usage.unlimited') : t('channel_usage.remaining', { value: formatUsagePercent(remaining) })}
                            </Typography>
                          </Stack>
                          <LinearProgress
                            variant="determinate"
                            value={remaining}
                            sx={{
                              height: 6,
                              borderRadius: 1,
                              bgcolor: 'action.hover',
                              '& .MuiLinearProgress-bar': { borderRadius: 1, bgcolor: barColor }
                            }}
                          />
                        </Box>
                      )
                    })}
                  </Stack>
                )}
              </Box>
            </Tooltip>
          </Box>
        )
      })}
    </SubCard>
  )
}
