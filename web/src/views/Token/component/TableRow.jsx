import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'

import { Box, Button, IconButton, MenuItem, Popover, Stack, TableCell, TableRow, Tooltip } from '@mui/material'

import RatioBadge from 'ui-component/RatioBadge'

import TableSwitch from 'ui-component/Switch'
import ConfirmDialog from 'ui-component/confirm-dialog'
import { copy, getAvailableModelNames, getChatLinks, renderQuota, replaceChatPlaceholders, timestamp2string } from 'utils/common'
import Label from 'ui-component/Label'

import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { stickyCellSx } from 'ui-component/stickyCellSx'

function statusInfo(t, status) {
  switch (status) {
    case 1:
      return t('common.enable')
    case 2:
      return t('common.disable')
    case 3:
      return t('common.expired')
    case 4:
      return t('common.exhaust')
    default:
      return t('common.unknown')
  }
}

function maskTokenKey(fullKey) {
  if (!fullKey) return ''
  if (fullKey.length <= 12) return fullKey
  return `${fullKey.slice(0, 6)}****${fullKey.slice(-6)}`
}

export default function TokensTableRow({ item, manageToken, handleOpenModal, setModalTokenId, userGroup, userIsReliable, isAdminSearch }) {
  const { t } = useTranslation()
  const [openDelete, setOpenDelete] = useState(false)
  const [openRefreshKey, setOpenRefreshKey] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [refreshingKey, setRefreshingKey] = useState(false)
  const [statusSwitch, setStatusSwitch] = useState(item.status)
  const [keyVisible, setKeyVisible] = useState(false)
  const [modelNames, setModelNames] = useState([])
  const [menuAnchor, setMenuAnchor] = useState(null)
  const [menuItems, setMenuItems] = useState([])

  const user = useSelector((state) => state.account.user)
  const siteInfo = useSelector((state) => state.siteInfo)
  const followingRatio = !isAdminSearch && user?.group ? userGroup?.[user.group]?.ratio : undefined
  const fullKey = `sk-${item.key}`
  const chatLinks = getChatLinks()

  const renderGroupCell = (symbol, fallback, fallbackRatio) => {
    let label
    let ratio
    if (!symbol) {
      label = <Label color="default">{fallback}</Label>
      ratio = fallbackRatio
    } else {
      const g = userGroup[symbol]
      if (!g) {
        label = <Label color="error">{symbol} (不存在)</Label>
      } else {
        label = g.inaccessible
          ? <Label color="error">{g.name} (不可用)</Label>
          : <Label color={g.color}>{g.name}</Label>
        ratio = g.ratio
      }
    }
    return (
      <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5}>
        {label}
        {ratio !== undefined && ratio !== null && <RatioBadge ratio={ratio}/>}
      </Stack>
    )
  }

  const handleOpenChatMenu = (event) => {
    setMenuItems(chatItems)
    setMenuAnchor(event.currentTarget)
  }

  const handleCloseMenu = () => {
    setMenuAnchor(null)
  }

  const handleDeleteOpen = () => {
    handleCloseMenu()
    setOpenDelete(true)
  }

  const handleDeleteClose = () => {
    setOpenDelete(false)
  }

  const handleRefreshKeyOpen = () => {
    handleCloseMenu()
    setOpenRefreshKey(true)
  }

  const handleRefreshKeyClose = () => {
    setOpenRefreshKey(false)
  }

  const handleStatus = async() => {
    const switchVlue = statusSwitch === 1 ? 2 : 1
    const { success } = await manageToken(item.id, 'status', switchVlue)
    if (success) {
      setStatusSwitch(switchVlue)
    }
  }

  const handleDelete = async() => {
    if (deleting) return

    setDeleting(true)
    try {
      await manageToken(item.id, 'delete', '')
    } finally {
      setDeleting(false)
      setOpenDelete(false)
    }
  }

  const handleRefreshKey = async() => {
    if (refreshingKey) return

    setRefreshingKey(true)
    try {
      await manageToken(item.id, 'refresh_key', '')
    } finally {
      setRefreshingKey(false)
      setOpenRefreshKey(false)
    }
  }

  const loadModelNames = async() => {
    if (modelNames.length > 0) return modelNames

    const names = await getAvailableModelNames()
    setModelNames(names)
    return names
  }

  const handleChatLink = async(option, type) => {
    const models = await loadModelNames()
    const server = encodeURIComponent(siteInfo?.server_address || window.location.host)
    const text = replaceChatPlaceholders(option.url, fullKey, server, encodeURIComponent(models.join(',')))
    if (type === 'link') {
      window.open(text)
    } else {
      copy(text, t('common.link'))
    }
    handleCloseMenu()
  }

  const chatItems = chatLinks.map((option) => ({
    text: option.name,
    onClick: () => handleChatLink(option, 'link')
  }))

  useEffect(() => {
    setStatusSwitch(item.status)
  }, [item.status])

  return (
    <>
      <TableRow tabIndex={item.id}>
        {isAdminSearch && (
          <TableCell>
            <Tooltip title={`ID: ${item.user_id}`} placement="top">
              <span>{item.user_id} - {item.owner_name || '-'}</span>
            </Tooltip>
          </TableCell>
        )}
        <TableCell>{item.name}</TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Box
              component="code"
              sx={{
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                px: 0.75,
                py: 0.25,
                bgcolor: 'action.hover',
                borderRadius: 0.5,
                userSelect: keyVisible ? 'all' : 'none',
                wordBreak: keyVisible ? 'break-all' : 'normal'
              }}
            >
              {keyVisible ? fullKey : maskTokenKey(fullKey)}
            </Box>
            <Tooltip title={keyVisible ? t('token_index.hideKey') : t('token_index.showKey')} placement="top" arrow>
              <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setKeyVisible((v) => !v)}>
                <Icon icon={keyVisible ? 'solar:eye-closed-bold-duotone' : 'solar:eye-bold-duotone'} width={16}/>
              </IconButton>
            </Tooltip>
            <Tooltip title={t('token_index.copy')} placement="top" arrow>
              <IconButton size="small" sx={{ p: 0.25, color: 'primary.main' }} onClick={() => copy(fullKey, t('token_index.token'))}>
                <Icon icon="solar:copy-bold-duotone" width={16}/>
              </IconButton>
            </Tooltip>
            {!isAdminSearch && chatLinks.length > 0 && (
              <Tooltip title={t('token_index.chat')} placement="top" arrow>
                <IconButton size="small" sx={{ p: 0.25 }} onClick={handleOpenChatMenu}>
                  <Icon icon="solar:chat-round-dots-bold-duotone" width={16}/>
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </TableCell>
        <TableCell>
          {isAdminSearch ? (
            <Stack direction="column" spacing={0.5} alignItems="flex-start">
              {renderGroupCell(item.group, '跟随用户')}
              {renderGroupCell(item.backup_group, '-')}
            </Stack>
          ) : (
            renderGroupCell(item.group, '跟随用户', followingRatio)
          )}
        </TableCell>
        {userIsReliable && (
          <TableCell>
            {renderGroupCell(item.setting?.billing_tag, '-')}
          </TableCell>
        )}

        <TableCell>
          <Tooltip title={statusInfo(t, statusSwitch)} placement="top">
            <TableSwitch
              id={`switch-${item.id}`}
              checked={statusSwitch === 1}
              onChange={handleStatus}
            />
          </Tooltip>
        </TableCell>

        {isAdminSearch ? (
          <TableCell>
            <Stack direction="column" spacing={0.5}>
              <span>{renderQuota(item.used_quota)}</span>
              <span style={{ color: 'text.secondary' }}>{item.unlimited_quota ? t('token_index.unlimited') : renderQuota(item.remain_quota, 2)}</span>
            </Stack>
          </TableCell>
        ) : (
          <>
            <TableCell>{renderQuota(item.used_quota)}</TableCell>
            <TableCell>{item.unlimited_quota ? t('token_index.unlimited') : renderQuota(item.remain_quota, 2)}</TableCell>
          </>
        )}

        {isAdminSearch ? (
          <TableCell sx={{ whiteSpace: 'nowrap' }}>
            <Stack direction="column" spacing={0.5}>
              <span>{timestamp2string(item.created_time)}</span>
              <span style={{ color: 'text.secondary' }}>{item.expired_time === -1 ? t('token_index.neverExpires') : timestamp2string(item.expired_time)}</span>
            </Stack>
          </TableCell>
        ) : (
          <>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>{timestamp2string(item.created_time)}</TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>{item.expired_time === -1 ? t('token_index.neverExpires') : timestamp2string(item.expired_time)}</TableCell>
          </>
        )}

        {isAdminSearch && (
          <TableCell sx={{ whiteSpace: 'nowrap' }}>
            {item.accessed_time ? timestamp2string(item.accessed_time) : '-'}
          </TableCell>
        )}

        <TableCell sx={stickyCellSx}>
          <Stack direction="row" justifyContent="center" alignItems="center" spacing={0.5}>
            <Tooltip title={t('common.edit')} placement="top" arrow>
              <IconButton
                size="small"
                onClick={() => {
                  handleOpenModal()
                  setModalTokenId(item.id)
                }}
              >
                <Icon icon="solar:pen-bold-duotone" width={20}/>
              </IconButton>
            </Tooltip>
            <Tooltip title={t('token_index.refreshKey')} placement="top" arrow>
              <IconButton size="small" onClick={handleRefreshKeyOpen}>
                <Icon icon="solar:key-minimalistic-square-2-bold-duotone" width={20}/>
              </IconButton>
            </Tooltip>
            <Tooltip title={t('common.delete')} placement="top" arrow>
              <IconButton size="small" sx={{ color: 'error.main' }} onClick={handleDeleteOpen}>
                <Icon icon="solar:trash-bin-trash-bold-duotone" width={20}/>
              </IconButton>
            </Tooltip>
          </Stack>
        </TableCell>
      </TableRow>

      <Popover
        open={!!menuAnchor}
        anchorEl={menuAnchor}
        onClose={handleCloseMenu}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { minWidth: 140 } }}
      >
        {menuItems.map((menuItem, index) => (
          <MenuItem key={index} onClick={menuItem.onClick} sx={{ color: menuItem.color }}>
            {menuItem.icon && <Icon icon={menuItem.icon} style={{ marginRight: '16px' }}/>}
            {menuItem.text}
          </MenuItem>
        ))}
      </Popover>

      <ConfirmDialog
        open={openDelete}
        onClose={handleDeleteClose}
        title={t('common.delete')}
        content={t('common.deleteConfirm', { title: `Token "${item.name}"` })}
        action={
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? '删除中...' : t('token_index.delete')}
          </Button>
        }
      />

      <ConfirmDialog
        open={openRefreshKey}
        onClose={handleRefreshKeyClose}
        title={t('token_index.refreshKey')}
        content={t('token_index.refreshKeyConfirm', { title: item.name })}
        action={
          <Button
            variant="contained"
            color="warning"
            onClick={handleRefreshKey}
            disabled={refreshingKey}
          >
            {refreshingKey ? t('token_index.refreshingKey') : t('token_index.refreshKey')}
          </Button>
        }
      />
    </>
  )
}

TokensTableRow.propTypes = {
  item: PropTypes.object,
  manageToken: PropTypes.func,
  handleOpenModal: PropTypes.func,
  setModalTokenId: PropTypes.func,
  userGroup: PropTypes.object,
  userIsReliable: PropTypes.bool,
  isAdminSearch: PropTypes.bool
}
