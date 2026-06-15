import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material';
import LoadingButton from '@mui/lab/LoadingButton';
import { Icon } from '@iconify/react';
import { useTranslation } from 'react-i18next';
import { CronBuilderDialog } from 'components/CronBuilderDialog';
import { API } from 'utils/api';
import { showError, showSuccess } from 'utils/common';

const defaultSchedule = {
  enabled: false,
  mode: 'add',
  interval: 1440,
  cron: '',
  service: ''
};

const modeOptions = [
  { value: 'add', label: '仅添加缺失数据' },
  { value: 'overwrite', label: '覆盖已有数据' },
  { value: 'replace', label: '全量替换' }
];

export const ScheduleModal = ({ open, onCancel, onSynced }) => {
  const { t } = useTranslation();
  const [schedule, setSchedule] = useState(defaultSchedule);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [openCronBuilder, setOpenCronBuilder] = useState(false);

  const fetchSchedule = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/model_info/schedule');
      const { success, message, data } = res.data;
      if (success) {
        setSchedule({ ...defaultSchedule, ...data });
      } else {
        showError(message);
      }
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchSchedule();
    }
  }, [open]);

  const handleChange = (field) => (event) => {
    const value = field === 'enabled' ? event.target.checked : event.target.value;
    setSchedule((current) => ({
      ...current,
      [field]: field === 'interval' ? Number(value) : value
    }));
  };

  const handleApplyCron = (cron) => {
    setSchedule((current) => ({
      ...current,
      cron
    }));
    setOpenCronBuilder(false);
  };

  const buildPayload = () => ({
    ...schedule,
    cron: schedule.cron.trim(),
    service: schedule.service.trim()
  });

  const handleSave = async () => {
    const payload = buildPayload();
    if (payload.enabled && !payload.cron && payload.interval <= 0) {
      showError('启用自动更新时，间隔必须大于 0');
      return;
    }
    if (!payload.service) {
      showError('请填写模型详情数据 URL');
      return;
    }

    setSaving(true);
    try {
      const res = await API.put('/api/model_info/schedule', payload);
      const { success, message } = res.data;
      if (success) {
        showSuccess('模型详情同步设置已保存');
        onCancel();
      } else {
        showError(message);
      }
    } catch (err) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const saveRes = await API.put('/api/model_info/schedule', buildPayload());
      if (!saveRes.data?.success) {
        throw new Error(saveRes.data?.message || '保存同步设置失败');
      }
      const res = await API.post('/api/model_info/sync_service');
      const { success, message, data } = res.data;
      if (success) {
        const parts = [];
        if (data?.created > 0) parts.push(`新增 ${data.created}`);
        if (data?.updated > 0) parts.push(`覆盖 ${data.updated}`);
        if (data?.skipped > 0) parts.push(`跳过 ${data.skipped}`);
        if (data?.failed > 0) parts.push(`失败 ${data.failed}`);
        if (data?.deleted > 0) parts.push(`删除 ${data.deleted}`);
        showSuccess(`同步完成：${parts.join('，') || '无变更'}`);
        onSynced?.();
      } else {
        showError(message);
      }
    } catch (err) {
      showError(err?.response?.data?.message || err.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving || syncing ? undefined : onCancel} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Icon icon="solar:database-bold-duotone" width={20} />
        模型详情同步设置
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <FormControlLabel
            control={<Switch checked={schedule.enabled} onChange={handleChange('enabled')} disabled={loading || saving || syncing} />}
            label="自动更新模型详情"
          />

          <FormControl fullWidth size="small">
            <InputLabel>更新模式</InputLabel>
            <Select value={schedule.mode} label="更新模式" onChange={handleChange('mode')} disabled={loading || saving || syncing}>
              {modeOptions.map((item) => (
                <MenuItem key={item.value} value={item.value}>
                  {item.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            size="small"
            type="number"
            label="更新间隔（分钟）"
            value={schedule.interval}
            onChange={handleChange('interval')}
            disabled={loading || saving || syncing || Boolean(schedule.cron)}
            inputProps={{ min: 1 }}
            helperText={schedule.cron ? '已配置 cron 时，间隔设置不会生效' : '留空 cron 时使用此间隔'}
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
            <TextField
              fullWidth
              size="small"
              label="Cron 表达式"
              value={schedule.cron}
              onChange={handleChange('cron')}
              disabled={loading || saving || syncing}
              placeholder="0 3 * * *"
              helperText="使用服务器时区；填写后优先于间隔设置"
            />
            <Button
              variant="outlined"
              onClick={() => setOpenCronBuilder(true)}
              disabled={loading || saving || syncing}
              startIcon={<Icon icon="solar:calendar-search-bold-duotone" width={18} />}
              sx={{ minWidth: 112 }}
            >
              选择
            </Button>
          </Stack>

          <TextField
            size="small"
            label="模型详情数据 URL"
            value={schedule.service}
            onChange={handleChange('service')}
            disabled={loading || saving || syncing}
            helperText="支持 data[].model_info 格式，也兼容直接的模型详情数组"
          />

          <Alert severity={schedule.mode === 'add' ? 'info' : 'warning'} variant="outlined">
            <Typography variant="body2">
              {schedule.mode === 'replace'
                ? '全量替换会更新同名模型详情，并删除远端不存在的本地模型详情。'
                : schedule.mode === 'overwrite'
                  ? '覆盖模式会更新同名模型详情，但不会删除本地冗余数据。'
                  : '添加模式只导入系统中缺失的模型详情。'}
            </Typography>
          </Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={saving || syncing}>
          取消
        </Button>
        <LoadingButton variant="outlined" onClick={handleSyncNow} loading={syncing} disabled={loading || saving}>
          立即同步
        </LoadingButton>
        <LoadingButton variant="contained" onClick={handleSave} loading={saving} disabled={loading || syncing}>
          保存设置
        </LoadingButton>
      </DialogActions>

      <CronBuilderDialog
        open={openCronBuilder}
        value={schedule.cron}
        onClose={() => setOpenCronBuilder(false)}
        onApply={handleApplyCron}
        labels={{
          title: t('pricingPage.scheduleCronSelectTitle'),
          frequency: t('pricingPage.scheduleCronFrequency'),
          custom: t('pricingPage.scheduleCronCustom'),
          hourly: t('pricingPage.scheduleCronHourly'),
          daily: t('pricingPage.scheduleCronDaily'),
          weekly: t('pricingPage.scheduleCronWeekly'),
          monthly: t('pricingPage.scheduleCronMonthly'),
          minute: t('pricingPage.scheduleCronMinute'),
          hour: t('pricingPage.scheduleCronHour'),
          monthDay: t('pricingPage.scheduleCronMonthDay'),
          month: t('pricingPage.scheduleCronMonth'),
          weekDay: t('pricingPage.scheduleCronWeekDay'),
          everyMinute: t('pricingPage.scheduleCronEveryMinute'),
          everyHour: t('pricingPage.scheduleCronEveryHour'),
          everyMonthDay: t('pricingPage.scheduleCronEveryMonthDay'),
          everyMonth: t('pricingPage.scheduleCronEveryMonth'),
          everyWeekDay: t('pricingPage.scheduleCronEveryWeekDay'),
          monthDayHelper: t('pricingPage.scheduleCronMonthDayHelper'),
          preview: t('pricingPage.scheduleCronPreview'),
          cancel: t('profilePage.cancel'),
          apply: t('pricingPage.scheduleCronApply'),
          monday: t('pricingPage.scheduleCronMonday'),
          tuesday: t('pricingPage.scheduleCronTuesday'),
          wednesday: t('pricingPage.scheduleCronWednesday'),
          thursday: t('pricingPage.scheduleCronThursday'),
          friday: t('pricingPage.scheduleCronFriday'),
          saturday: t('pricingPage.scheduleCronSaturday'),
          sunday: t('pricingPage.scheduleCronSunday')
        }}
      />
    </Dialog>
  );
};

ScheduleModal.propTypes = {
  open: PropTypes.bool,
  onCancel: PropTypes.func,
  onSynced: PropTypes.func
};
