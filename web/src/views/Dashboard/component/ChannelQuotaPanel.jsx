import { useEffect, useMemo, useState } from 'react'
import { Box, CircularProgress, Divider, LinearProgress, Stack, Tooltip, Typography } from '@mui/material'
import SubCard from 'ui-component/cards/SubCard'
import { API } from 'utils/api'
import {
  formatResetAt,
  formatUsagePercent,
  getCachedUsage,
  getUsageSummaryLabel,
  parseUsageWindows
} from 'utils/channelUsage'

function providerName(type) {
  switch (Number(type)) {
    case 58:
      return 'ClaudeCode'
    case 59:
      return 'Codex'
    default:
      return 'OAuth'
  }
}

function minRemaining(windows) {
  if (!windows.length) return null
  return Math.min(...windows.map((window) => window.remainingPercent))
}

export default function ChannelQuotaPanel() {
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])

  useEffect(() => {
    let ignore = false

    const load = async() => {
      setLoading(true)
      try {
        const res = await getCachedUsage('dashboard:channels:12', () => API.get('/api/channel/usage', { params: { limit: 12 } }))
        const usageItems = res.data.success ? (res.data.data?.items || []) : []
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
      title="渠道额度"
      contentSX={{ p: 2 }}
    >
      {loading && (
        <Stack direction="row" spacing={1} alignItems="center">
          <CircularProgress size={16}/>
          <Typography variant="body2" color="text.secondary">正在查询渠道额度...</Typography>
        </Stack>
      )}

      {!loading && visibleItems.length === 0 && (
        <Typography variant="body2" color="text.secondary">暂无 ClaudeCode / Codex 渠道额度数据</Typography>
      )}

      {!loading && visibleItems.map((item, index) => {
        const windows = parseUsageWindows(item.channel.type, item.data?.usage)
        const remaining = minRemaining(windows)
        const empty = item.data?.empty || (!item.error && windows.length === 0)
        const tooltip = item.error ? (
          item.error
        ) : (
          <Box>
            {empty ? (
              <Typography variant="body2">{item.data?.warning || '暂无活跃额度窗口'}</Typography>
            ) : (
              windows.map((window) => (
                <Typography key={window.key} variant="body2">
                  {window.label}: 已用 {formatUsagePercent(window.usedPercent)} / 剩余 {formatUsagePercent(window.remainingPercent)}，重置 {formatResetAt(window.resetsAt, window.resetUnit)}
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
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
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
                      color: item.error ? 'error.main' : empty ? 'warning.main' : 'success.main',
                      fontWeight: 800,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {item.error ? '失败' : empty ? '暂无窗口' : getUsageSummaryLabel(windows)}
                  </Typography>
                </Stack>
                {!item.error && !empty && remaining !== null && (
                  <LinearProgress
                    variant="determinate"
                    value={remaining}
                    sx={{
                      mt: 1,
                      height: 6,
                      borderRadius: 1,
                      bgcolor: 'action.hover',
                      '& .MuiLinearProgress-bar': {
                        borderRadius: 1,
                        bgcolor: remaining < 20 ? 'error.main' : remaining < 50 ? 'warning.main' : 'success.main'
                      }
                    }}
                  />
                )}
              </Box>
            </Tooltip>
          </Box>
        )
      })}
    </SubCard>
  )
}
