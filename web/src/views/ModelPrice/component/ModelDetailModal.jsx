import PropTypes from 'prop-types';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
  Box,
  Avatar,
  Stack,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { alpha } from '@mui/material/styles';
import { Icon } from '@iconify/react';
import Label from 'ui-component/Label';
import { MODALITY_OPTIONS } from 'constants/Modality';
import { copy } from 'utils/common';
import { useTranslation } from 'react-i18next';

// ----------------------------------------------------------------------

export default function ModelDetailModal({ open, onClose, model, provider, modelInfo, priceData, ownedbyIcon, formatPrice, unit }) {
  const theme = useTheme();
  const { t } = useTranslation();
  if (!model) return null;
  // 解析模态和标签
  const getModalities = (modalitiesStr) => {
    try {
      return JSON.parse(modalitiesStr || '[]');
    } catch (e) {
      return [];
    }
  };

  const getTags = (tagsStr) => {
    try {
      return JSON.parse(tagsStr || '[]');
    } catch (e) {
      return [];
    }
  };

  const inputModalities = modelInfo ? getModalities(modelInfo.input_modalities) : [];
  const outputModalities = modelInfo ? getModalities(modelInfo.output_modalities) : [];
  const tags = modelInfo ? getTags(modelInfo.tags) : [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      sx={{
        '& .MuiBackdrop-root': {
          backgroundColor:
            theme.palette.mode === 'dark'
              ? alpha('#020617', 0.62)
              : alpha('#dbeafe', 0.34),
          backdropFilter: 'blur(10px) saturate(125%)',
          WebkitBackdropFilter: 'blur(10px) saturate(125%)'
        },
        '& .MuiDialog-paper': {
          borderRadius: '16px',
          background:
            theme.palette.mode === 'dark'
              ? `linear-gradient(135deg, ${alpha('#0b1628', 0.78)} 0%, ${alpha('#071424', 0.68)} 100%)`
              : `linear-gradient(135deg, ${alpha('#ffffff', 0.62)} 0%, ${alpha('#eff8ff', 0.46)} 52%, ${alpha('#e9fbf6', 0.38)} 100%)`,
          backdropFilter: 'blur(30px) saturate(170%)',
          WebkitBackdropFilter: 'blur(30px) saturate(170%)',
          border: `1px solid ${alpha(theme.palette.divider, theme.palette.mode === 'dark' ? 0.28 : 0.5)}`,
          boxShadow: `0 28px 80px ${alpha(theme.palette.common.black, theme.palette.mode === 'dark' ? 0.45 : 0.18)}`
        }
      }}
    >
      <DialogTitle sx={{ pb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            {ownedbyIcon && (
              <Avatar
                src={ownedbyIcon}
                alt={provider}
                sx={{
                  width: 48,
                  height: 48,
                  backgroundColor: theme.palette.mode === 'dark' ? '#fff' : theme.palette.background.paper,
                  '.MuiAvatar-img': {
                    objectFit: 'contain',
                    padding: '6px'
                  }
                }}
              >
                {provider?.charAt(0).toUpperCase()}
              </Avatar>
            )}
            <Box>
              <Typography variant="h3" sx={{ fontWeight: 600, mb: 0.5 }}>
                {modelInfo?.name || model}
              </Typography>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                  {model}
                </Typography>
                <IconButton size="small" onClick={() => copy(model, t('modelpricePage.modelId'))} sx={{ p: 0.5 }}>
                  <Icon icon="eva:copy-outline" width={16} height={16} />
                </IconButton>
              </Stack>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ mr: 4 }}>
            {tags.includes('Hot') && (
              <Label color="error" variant="filled" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Icon icon="mdi:fire" width={16} height={16} />
                Hot
              </Label>
            )}
          </Stack>
        </Box>
        <IconButton
          onClick={onClose}
          sx={{
            position: 'absolute',
            right: 12,
            top: 12,
            color: 'text.secondary'
          }}
        >
          <Icon icon="eva:close-outline" width={24} height={24} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 0 }}>
        {/* 模型描述 */}
        {modelInfo?.description && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.8 }}>
              {modelInfo.description}
            </Typography>
          </Box>
        )}

        <Divider sx={{ my: 3 }} />

        {/* 模型信息 */}
        <Box sx={{ mb: 3 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
            <Icon icon="eva:info-outline" width={20} height={20} />
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {t('modelpricePage.modelInfo')}
            </Typography>
          </Stack>

          <Stack spacing={2}>
            {/* 类型 */}
            <Stack direction="row" alignItems="center" spacing={2}>
              <Icon icon="eva:cube-outline" width={18} height={18} color={theme.palette.text.secondary} />
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                {t('modelpricePage.type')}:
              </Typography>
              <Label color="primary" variant="soft">
                {priceData?.price?.type === 'tokens' ? t('modelpricePage.tokens') : t('modelpricePage.times')}
              </Label>
            </Stack>

            {/* 上下文长度 */}
            {modelInfo?.context_length > 0 && (
              <Stack direction="row" alignItems="center" spacing={2}>
                <Icon icon="eva:file-text-outline" width={18} height={18} color={theme.palette.text.secondary} />
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                  {t('modelpricePage.contextLength')}:
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {modelInfo.context_length.toLocaleString()}
                </Typography>
              </Stack>
            )}

            {/* 最大Tokens */}
            {modelInfo?.max_tokens > 0 && (
              <Stack direction="row" alignItems="center" spacing={2}>
                <Icon icon="eva:maximize-outline" width={18} height={18} color={theme.palette.text.secondary} />
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                  {t('modelpricePage.maxTokens')}:
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {modelInfo.max_tokens.toLocaleString()}
                </Typography>
              </Stack>
            )}

            {/* 输入模态 */}
            {inputModalities.length > 0 && (
              <Stack direction="row" alignItems="center" spacing={2}>
                <Icon icon="eva:arrow-down-outline" width={18} height={18} color={theme.palette.text.secondary} />
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                  {t('modelpricePage.inputModality')}:
                </Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {inputModalities.map((modality, index) => (
                    <Label key={index} variant="soft" color={MODALITY_OPTIONS[modality]?.color || 'primary'}>
                      {MODALITY_OPTIONS[modality]?.text || modality}
                    </Label>
                  ))}
                </Stack>
              </Stack>
            )}

            {/* 输出模态 */}
            {outputModalities.length > 0 && (
              <Stack direction="row" alignItems="center" spacing={2}>
                <Icon icon="eva:arrow-up-outline" width={18} height={18} color={theme.palette.text.secondary} />
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                  {t('modelpricePage.outputModality')}:
                </Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {outputModalities.map((modality, index) => (
                    <Label key={index} variant="soft" color={MODALITY_OPTIONS[modality]?.color || 'secondary'}>
                      {MODALITY_OPTIONS[modality]?.text || modality}
                    </Label>
                  ))}
                </Stack>
              </Stack>
            )}

            {/* 标签 */}
            {tags.length > 0 && (
              <Stack direction="row" alignItems="center" spacing={2}>
                <Icon icon="eva:pricetags-outline" width={18} height={18} color={theme.palette.text.secondary} />
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                  {t('modelpricePage.tags')}:
                </Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {tags.map((tag, index) => (
                    <Chip key={index} label={tag} size="small" />
                  ))}
                </Stack>
              </Stack>
            )}
          </Stack>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* 价格明细 */}
        <Box sx={{ mb: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
            <Icon icon="mdi:attach-money" width={20} height={20} />
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {t('modelpricePage.priceDetails')}
            </Typography>
          </Stack>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
            {t('modelpricePage.priceNote')}
          </Typography>

          {/* 价格表格 */}
          <TableContainer
            sx={{
              position: 'relative',
              border: `1px solid ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.2 : 0.18)}`,
              borderRadius: '8px',
              overflow: 'hidden',
              background:
                theme.palette.mode === 'dark'
                  ? `linear-gradient(135deg, ${alpha('#10213a', 0.48)} 0%, ${alpha('#071424', 0.54)} 100%)`
                  : `linear-gradient(135deg, ${alpha('#ffffff', 0.16)} 0%, ${alpha('#e0f2fe', 0.1)} 46%, ${alpha('#ccfbf1', 0.08)} 100%)`,
              backdropFilter: 'blur(42px) saturate(210%)',
              WebkitBackdropFilter: 'blur(42px) saturate(210%)',
              boxShadow:
                theme.palette.mode === 'dark'
                  ? `inset 0 1px 0 ${alpha('#ffffff', 0.06)}`
                  : `inset 0 1px 0 ${alpha('#ffffff', 0.92)}, inset 0 -1px 0 ${alpha(theme.palette.primary.main, 0.05)}, 0 14px 34px ${alpha('#0f172a', 0.035)}`,
              '&:before': {
                content: '""',
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                background:
                  theme.palette.mode === 'dark'
                    ? `linear-gradient(180deg, ${alpha('#ffffff', 0.04)}, transparent 55%)`
                    : `linear-gradient(180deg, ${alpha('#ffffff', 0.34)}, ${alpha('#ffffff', 0.05)} 48%, transparent)`,
                zIndex: 0
              },
              '&:after': {
                content: '""',
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                background:
                  theme.palette.mode === 'dark'
                    ? 'transparent'
                    : `radial-gradient(circle at 18% 0%, ${alpha(theme.palette.primary.light, 0.12)}, transparent 38%), radial-gradient(circle at 85% 100%, ${alpha(theme.palette.success.light, 0.1)}, transparent 34%)`,
                zIndex: 0
              },
              '& .MuiTable-root': {
                position: 'relative',
                zIndex: 1,
                backgroundColor: 'transparent'
              },
              '& .MuiTableCell-root': {
                borderColor: alpha(theme.palette.divider, theme.palette.mode === 'dark' ? 0.2 : 0.34),
                backgroundColor: 'transparent'
              },
              '& .MuiTableHead-root .MuiTableCell-root': {
                backgroundColor:
                  theme.palette.mode === 'dark'
                    ? alpha(theme.palette.primary.main, 0.13)
                    : alpha('#ffffff', 0.12),
                color: 'text.primary',
                backdropFilter: 'blur(28px) saturate(190%)',
                WebkitBackdropFilter: 'blur(28px) saturate(190%)'
              },
              '& .MuiTableBody-root .MuiTableRow-root': {
                backgroundColor:
                  theme.palette.mode === 'dark'
                    ? alpha(theme.palette.background.paper, 0.18)
                    : alpha('#ffffff', 0.07),
                transition: 'background-color .16s ease'
              },
              '& .MuiTableBody-root .MuiTableRow-root:hover': {
                backgroundColor:
                  theme.palette.mode === 'dark'
                    ? alpha(theme.palette.primary.main, 0.12)
                    : alpha(theme.palette.primary.main, 0.045)
              }
            }}
          >
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>{t('modelpricePage.group')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('modelpricePage.input')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('modelpricePage.output')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {priceData?.allGroupPrices?.map((groupPrice, index) => {
                  return (
                    <TableRow key={index} hover>
                      <TableCell>
                        <Label color="primary" variant="soft">
                          {groupPrice.groupName}
                        </Label>
                      </TableCell>
                      <TableCell>
                        <Label color="success" variant="outlined">
                          {formatPrice(groupPrice.input, groupPrice?.type)}
                        </Label>
                      </TableCell>
                      <TableCell>
                        <Label color="warning" variant="outlined">
                          {formatPrice(groupPrice.output, groupPrice?.type)}
                        </Label>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* 其他信息 */}
        {priceData?.price?.extra_ratios && Object.keys(priceData.price.extra_ratios).length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <Icon icon="eva:bar-chart-outline" width={20} height={20} />
              <Typography variant="h5" sx={{ fontWeight: 600 }}>
                {t('modelpricePage.otherInfo')}
              </Typography>
            </Stack>
            <Stack spacing={1}>
              {Object.entries(priceData.price.extra_ratios).map(([key, value]) => (
                <Stack key={key} direction="row" alignItems="center" spacing={2}>
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                    {t(`modelpricePage.${key}`)}:
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {value}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}

ModelDetailModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  model: PropTypes.string,
  provider: PropTypes.string,
  modelInfo: PropTypes.object,
  priceData: PropTypes.object,
  ownedbyIcon: PropTypes.string,
  userGroupMap: PropTypes.object,
  formatPrice: PropTypes.func,
  unit: PropTypes.string
};
