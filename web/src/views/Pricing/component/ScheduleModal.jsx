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
  mode: 'system',
  interval: 1440,
  cron: '',
  service: ''
};

const modeOptions = [
  { value: 'system', labelKey: 'pricingPage.scheduleModeSystem' },
  { value: 'add', labelKey: 'pricingPage.scheduleModeAdd' },
  { value: 'update', labelKey: 'pricingPage.scheduleModeUpdate' },
  { value: 'overwrite', labelKey: 'pricingPage.scheduleModeOverwrite' },
  { value: 'replace', labelKey: 'pricingPage.scheduleModeReplace' }
];

export const ScheduleModal = ({ open, onCancel }) => {
  const { t } = useTranslation();
  const [schedule, setSchedule] = useState(defaultSchedule);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openCronBuilder, setOpenCronBuilder] = useState(false);

  const fetchSchedule = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/prices/schedule');
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

  const handleSave = async () => {
    const payload = {
      ...schedule,
      cron: schedule.cron.trim(),
      service: schedule.service.trim()
    };

    if (payload.enabled && !payload.cron && payload.interval <= 0) {
      showError(t('pricingPage.scheduleIntervalError'));
      return;
    }
    if (!payload.service) {
      showError(t('pricingPage.scheduleServiceRequired'));
      return;
    }

    setSaving(true);
    try {
      const res = await API.put('/api/prices/schedule', payload);
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('pricingPage.scheduleSaveSuccess'));
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

  return (
    <Dialog open={open} onClose={saving ? undefined : onCancel} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Icon icon="solar:calendar-mark-bold-duotone" width={20} />
        {t('pricingPage.scheduleSettings')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <FormControlLabel
            control={<Switch checked={schedule.enabled} onChange={handleChange('enabled')} disabled={loading || saving} />}
            label={t('pricingPage.scheduleEnabled')}
          />

          <FormControl fullWidth size="small">
            <InputLabel>{t('pricingPage.scheduleMode')}</InputLabel>
            <Select value={schedule.mode} label={t('pricingPage.scheduleMode')} onChange={handleChange('mode')} disabled={loading || saving}>
              {modeOptions.map((item) => (
                <MenuItem key={item.value} value={item.value}>
                  {t(item.labelKey)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            size="small"
            type="number"
            label={t('pricingPage.scheduleInterval')}
            value={schedule.interval}
            onChange={handleChange('interval')}
            disabled={loading || saving || Boolean(schedule.cron)}
            inputProps={{ min: 1 }}
            helperText={schedule.cron ? t('pricingPage.scheduleIntervalDisabled') : t('pricingPage.scheduleIntervalHelper')}
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
            <TextField
              fullWidth
              size="small"
              label={t('pricingPage.scheduleCron')}
              value={schedule.cron}
              onChange={handleChange('cron')}
              disabled={loading || saving}
              placeholder="0 3 * * *"
              helperText={t('pricingPage.scheduleCronHelper')}
            />
            <Button
              variant="outlined"
              onClick={() => setOpenCronBuilder(true)}
              disabled={loading || saving}
              startIcon={<Icon icon="solar:calendar-search-bold-duotone" width={18} />}
              sx={{ minWidth: 112 }}
            >
              {t('pricingPage.scheduleCronSelect')}
            </Button>
          </Stack>

          <TextField
            size="small"
            label={t('pricingPage.scheduleService')}
            value={schedule.service}
            onChange={handleChange('service')}
            disabled={loading || saving}
            helperText={t('pricingPage.scheduleServiceHelper')}
          />

          <Alert severity={schedule.mode === 'overwrite' || schedule.mode === 'replace' ? 'warning' : 'info'} variant="outlined">
            <Typography variant="body2">
              {schedule.mode === 'replace'
                ? t('pricingPage.scheduleReplaceTip')
                : schedule.mode === 'system'
                  ? t('pricingPage.scheduleSystemTip')
                  : t('pricingPage.scheduleRemoteTip')}
            </Typography>
          </Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={saving}>
          {t('profilePage.cancel')}
        </Button>
        <LoadingButton variant="contained" onClick={handleSave} loading={saving} disabled={loading}>
          {t('pricingPage.scheduleSave')}
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
  onCancel: PropTypes.func
};
