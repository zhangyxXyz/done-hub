import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'
import { Box, CircularProgress, Stack, Tooltip, Typography } from '@mui/material'
import { Icon } from '@iconify/react'
import { API } from 'utils/api'
import {
  formatResetAt,
  formatUsagePercent,
  getCachedUsage,
  getUsageSummaryLabel,
  parseUsageWindows,
  supportsUsageWindows
} from 'utils/channelUsage'

export default function ChannelQuotaUsage({ channel }) {
  const [state, setState] = useState({ loading: false, data: null, error: '' })

  useEffect(() => {
    let ignore = false
    const loadUsage = async() => {
      if (!supportsUsageWindows(channel?.type) || !channel?.id) return
      setState((prev) => ({ ...prev, loading: true, error: '' }))
      try {
        const res = await getCachedUsage(`channel:${channel.id}`, () => API.get(`/api/channel/${channel.id}/usage`))
        const { success, message, data } = res.data
        if (ignore) return
        if (success) {
          setState({ loading: false, data, error: '' })
        } else {
          setState({ loading: false, data: null, error: message || '查询失败' })
        }
      } catch (error) {
        if (!ignore) setState({ loading: false, data: null, error: error.message || '查询失败' })
      }
    }

    loadUsage()
    return () => {
      ignore = true
    }
  }, [channel?.id, channel?.type])

  if (!supportsUsageWindows(channel?.type)) return null

  if (state.loading) {
    return <CircularProgress size={16}/>
  }

  if (state.error) {
    return (
      <Tooltip title={state.error}>
        <Typography variant="caption" color="error.main" sx={{ cursor: 'help', fontWeight: 700 }}>
          查询失败
        </Typography>
      </Tooltip>
    )
  }

  const windows = parseUsageWindows(channel.type, state.data?.usage)
  const empty = state.data?.empty || windows.length === 0
  const usageColor = empty ? 'warning.main' : 'primary.main'
  const title = (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>
        {channel.name} 渠道额度
      </Typography>
      {empty ? (
        <Typography variant="body2">{state.data?.warning || '暂无活跃额度窗口，发起一次会话后再查询'}</Typography>
      ) : (
        windows.map((window) => (
          <Typography key={window.key} variant="body2">
            {window.label}: 已用 {formatUsagePercent(window.usedPercent)} / 剩余 {formatUsagePercent(window.remainingPercent)}，重置 {formatResetAt(window.resetsAt, window.resetUnit)}
          </Typography>
        ))
      )}
      {(state.data?.cached || state.data?.stale || state.data?.warning) && (
        <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.75 }}>
          {state.data?.stale ? '旧缓存' : state.data?.cached ? '缓存' : ''}
          {state.data?.warning ? ` ${state.data.warning}` : ''}
        </Typography>
      )}
    </Box>
  )

  return (
    <Tooltip title={title} arrow placement="top">
      <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center" sx={{ cursor: 'help' }}>
        <Icon icon={empty ? 'mdi:clock-alert-outline' : 'mdi:gauge'} width={16}/>
        <Typography variant="caption" sx={{ color: usageColor, fontWeight: 800 }}>
          {empty ? '暂无窗口' : getUsageSummaryLabel(windows)}
        </Typography>
      </Stack>
    </Tooltip>
  )
}

ChannelQuotaUsage.propTypes = {
  channel: PropTypes.object
}
