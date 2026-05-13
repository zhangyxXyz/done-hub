import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  FormControlLabel,
  InputLabel,
  ListItemText,
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
  { value: 'overwrite', labelKey: 'pricingPage.scheduleModeOverwrite' }
];

const cronTypeOptions = [
  { value: 'custom', labelKey: 'pricingPage.scheduleCronCustom' },
  { value: 'hourly', labelKey: 'pricingPage.scheduleCronHourly' },
  { value: 'daily', labelKey: 'pricingPage.scheduleCronDaily' },
  { value: 'weekly', labelKey: 'pricingPage.scheduleCronWeekly' },
  { value: 'monthly', labelKey: 'pricingPage.scheduleCronMonthly' }
];

const numberOptions = (start, end) => Array.from({ length: end - start + 1 }, (_, index) => start + index);
const minuteOptions = numberOptions(0, 59);
const hourOptions = numberOptions(0, 23);
const monthDayOptions = numberOptions(1, 31);
const monthOptions = numberOptions(1, 12);

const weekDayOptions = [
  { value: 1, labelKey: 'pricingPage.scheduleCronMonday' },
  { value: 2, labelKey: 'pricingPage.scheduleCronTuesday' },
  { value: 3, labelKey: 'pricingPage.scheduleCronWednesday' },
  { value: 4, labelKey: 'pricingPage.scheduleCronThursday' },
  { value: 5, labelKey: 'pricingPage.scheduleCronFriday' },
  { value: 6, labelKey: 'pricingPage.scheduleCronSaturday' },
  { value: 0, labelKey: 'pricingPage.scheduleCronSunday' }
];

const defaultCronBuilder = {
  type: 'daily',
  minutes: [0],
  hours: [3],
  monthDays: [],
  months: [],
  weekDays: []
};

const presetCronValues = {
  custom: defaultCronBuilder,
  hourly: {
    type: 'hourly',
    minutes: [0],
    hours: [],
    monthDays: [],
    months: [],
    weekDays: []
  },
  daily: defaultCronBuilder,
  weekly: {
    type: 'weekly',
    minutes: [0],
    hours: [3],
    monthDays: [],
    months: [],
    weekDays: [1]
  },
  monthly: {
    type: 'monthly',
    minutes: [0],
    hours: [3],
    monthDays: [1],
    months: [],
    weekDays: []
  }
};

const toCronField = (values) => {
  if (!values.length) {
    return '*';
  }
  return [...values].sort((a, b) => a - b).join(',');
};

const buildCronExpression = ({ minutes, hours, monthDays, months, weekDays }) => {
  return [minutes, hours, monthDays, months, weekDays].map(toCronField).join(' ');
};

const parseCronField = (field, min, max) => {
  if (!field || field === '*') {
    return [];
  }
  const values = field
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((value) => Number.isInteger(value) && value >= min && value <= max);
  return [...new Set(values)].sort((a, b) => a - b);
};

const parseCronExpression = (cron) => {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) {
    return null;
  }
  if (fields.some((field) => field.includes('/') || field.includes('-'))) {
    return null;
  }
  return {
    type: 'custom',
    minutes: parseCronField(fields[0], 0, 59),
    hours: parseCronField(fields[1], 0, 23),
    monthDays: parseCronField(fields[2], 1, 31),
    months: parseCronField(fields[3], 1, 12),
    weekDays: parseCronField(fields[4], 0, 6)
  };
};

const renderCronValues = (values, allLabel) => {
  if (!values.length) {
    return allLabel;
  }
  return [...values].sort((a, b) => a - b).join(', ');
};

const CronFieldSelect = ({ label, values, options, onChange, allLabel, helperText, getOptionLabel }) => {
  const handleChange = (event) => {
    const next = event.target.value;
    if (next.includes('*')) {
      onChange([]);
      return;
    }
    onChange([...new Set(next.map(Number))].sort((a, b) => a - b));
  };

  return (
    <FormControl fullWidth size="small">
      <InputLabel>{label}</InputLabel>
      <Select
        multiple
        value={values}
        label={label}
        onChange={handleChange}
        renderValue={(selected) => renderCronValues(selected, allLabel)}
      >
        <MenuItem value="*">
          <Checkbox checked={values.length === 0} />
          <ListItemText primary={allLabel} />
        </MenuItem>
        {options.map((option) => (
          <MenuItem key={option.value ?? option} value={option.value ?? option}>
            <Checkbox checked={values.includes(option.value ?? option)} />
            <ListItemText primary={getOptionLabel ? getOptionLabel(option) : option.label ?? option} />
          </MenuItem>
        ))}
      </Select>
      {helperText && <FormHelperText>{helperText}</FormHelperText>}
    </FormControl>
  );
};

export const ScheduleModal = ({ open, onCancel }) => {
  const { t } = useTranslation();
  const [schedule, setSchedule] = useState(defaultSchedule);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openCronBuilder, setOpenCronBuilder] = useState(false);
  const [cronBuilder, setCronBuilder] = useState(defaultCronBuilder);

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

  const handleCronBuilderChange = (field) => (event) => {
    const value = event.target.value;
    if (field === 'type') {
      setCronBuilder({ ...presetCronValues[value], type: value });
      return;
    }
    setCronBuilder((current) => ({
      ...current,
      [field]: value
    }));
  };

  const handleOpenCronBuilder = () => {
    const parsed = parseCronExpression(schedule.cron);
    if (parsed) {
      setCronBuilder(parsed);
    }
    setOpenCronBuilder(true);
  };

  const cronPreview = buildCronExpression(cronBuilder);

  const handleApplyCron = () => {
    setSchedule((current) => ({
      ...current,
      cron: cronPreview
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
              onClick={handleOpenCronBuilder}
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

          <Alert severity={schedule.mode === 'overwrite' ? 'warning' : 'info'} variant="outlined">
            <Typography variant="body2">
              {schedule.mode === 'system' ? t('pricingPage.scheduleSystemTip') : t('pricingPage.scheduleRemoteTip')}
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

      <Dialog open={openCronBuilder} onClose={() => setOpenCronBuilder(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Icon icon="solar:calendar-search-bold-duotone" width={20} />
          {t('pricingPage.scheduleCronSelectTitle')}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('pricingPage.scheduleCronFrequency')}</InputLabel>
              <Select
                value={cronBuilder.type}
                label={t('pricingPage.scheduleCronFrequency')}
                onChange={handleCronBuilderChange('type')}
              >
                {cronTypeOptions.map((item) => (
                  <MenuItem key={item.value} value={item.value}>
                    {t(item.labelKey)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
              <CronFieldSelect
                label={t('pricingPage.scheduleCronMinute')}
                values={cronBuilder.minutes}
                options={minuteOptions}
                onChange={(values) => setCronBuilder((current) => ({ ...current, type: 'custom', minutes: values }))}
                allLabel={t('pricingPage.scheduleCronEveryMinute')}
              />
              <CronFieldSelect
                label={t('pricingPage.scheduleCronHour')}
                values={cronBuilder.hours}
                options={hourOptions}
                onChange={(values) => setCronBuilder((current) => ({ ...current, type: 'custom', hours: values }))}
                allLabel={t('pricingPage.scheduleCronEveryHour')}
              />
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
              <CronFieldSelect
                label={t('pricingPage.scheduleCronMonthDay')}
                values={cronBuilder.monthDays}
                options={monthDayOptions}
                onChange={(values) => setCronBuilder((current) => ({ ...current, type: 'custom', monthDays: values }))}
                allLabel={t('pricingPage.scheduleCronEveryMonthDay')}
                helperText={t('pricingPage.scheduleCronMonthDayHelper')}
              />
              <CronFieldSelect
                label={t('pricingPage.scheduleCronMonth')}
                values={cronBuilder.months}
                options={monthOptions}
                onChange={(values) => setCronBuilder((current) => ({ ...current, type: 'custom', months: values }))}
                allLabel={t('pricingPage.scheduleCronEveryMonth')}
              />
            </Stack>

            <CronFieldSelect
              label={t('pricingPage.scheduleCronWeekDay')}
              values={cronBuilder.weekDays}
              options={weekDayOptions}
              onChange={(values) => setCronBuilder((current) => ({ ...current, type: 'custom', weekDays: values }))}
              allLabel={t('pricingPage.scheduleCronEveryWeekDay')}
              getOptionLabel={(option) => t(option.labelKey)}
            />

            <Box
              sx={{
                px: 1.5,
                py: 1.25,
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.default'
              }}
            >
              <Typography variant="caption" color="text.secondary">
                {t('pricingPage.scheduleCronPreview')}
              </Typography>
              <Typography variant="subtitle1" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
                {cronPreview}
              </Typography>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCronBuilder(false)}>{t('profilePage.cancel')}</Button>
          <Button variant="contained" onClick={handleApplyCron}>
            {t('pricingPage.scheduleCronApply')}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
};

ScheduleModal.propTypes = {
  open: PropTypes.bool,
  onCancel: PropTypes.func
};
