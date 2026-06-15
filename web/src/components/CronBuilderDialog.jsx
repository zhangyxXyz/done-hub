import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Typography
} from '@mui/material';
import { Icon } from '@iconify/react';

const numberOptions = (start, end) => Array.from({ length: end - start + 1 }, (_, index) => start + index);
const minuteOptions = numberOptions(0, 59);
const hourOptions = numberOptions(0, 23);
const monthDayOptions = numberOptions(1, 31);
const monthOptions = numberOptions(1, 12);

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

const CronFieldSelect = ({ label, values, options, onChange, allLabel, helperText }) => {
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
            <ListItemText primary={option.label ?? option} />
          </MenuItem>
        ))}
      </Select>
      {helperText && <FormHelperText>{helperText}</FormHelperText>}
    </FormControl>
  );
};

const defaultLabels = {
  title: '选择 Cron',
  frequency: '执行频率',
  custom: '自定义',
  hourly: '每小时',
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  minute: '分钟',
  hour: '小时',
  monthDay: '日期',
  month: '月份',
  weekDay: '星期',
  everyMinute: '每分钟',
  everyHour: '每小时',
  everyMonthDay: '每天',
  everyMonth: '每月',
  everyWeekDay: '每天',
  monthDayHelper: '每月 29-31 日可能在部分月份不执行',
  preview: '生成的表达式',
  cancel: '取消',
  apply: '使用表达式',
  monday: '周一',
  tuesday: '周二',
  wednesday: '周三',
  thursday: '周四',
  friday: '周五',
  saturday: '周六',
  sunday: '周日'
};

export const CronBuilderDialog = ({ open, value, onClose, onApply, labels }) => {
  const text = { ...defaultLabels, ...labels };
  const [cronBuilder, setCronBuilder] = useState(defaultCronBuilder);

  useEffect(() => {
    if (!open) {
      return;
    }
    const parsed = parseCronExpression(value || '');
    setCronBuilder(parsed || defaultCronBuilder);
  }, [open, value]);

  const cronTypeOptions = [
    { value: 'custom', label: text.custom },
    { value: 'hourly', label: text.hourly },
    { value: 'daily', label: text.daily },
    { value: 'weekly', label: text.weekly },
    { value: 'monthly', label: text.monthly }
  ];

  const weekDayOptions = [
    { value: 1, label: text.monday },
    { value: 2, label: text.tuesday },
    { value: 3, label: text.wednesday },
    { value: 4, label: text.thursday },
    { value: 5, label: text.friday },
    { value: 6, label: text.saturday },
    { value: 0, label: text.sunday }
  ];

  const handleCronBuilderChange = (field) => (event) => {
    const next = event.target.value;
    if (field === 'type') {
      setCronBuilder({ ...presetCronValues[next], type: next });
      return;
    }
    setCronBuilder((current) => ({
      ...current,
      [field]: next
    }));
  };

  const cronPreview = buildCronExpression(cronBuilder);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Icon icon="solar:calendar-search-bold-duotone" width={20} />
        {text.title}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <FormControl fullWidth size="small">
            <InputLabel>{text.frequency}</InputLabel>
            <Select value={cronBuilder.type} label={text.frequency} onChange={handleCronBuilderChange('type')}>
              {cronTypeOptions.map((item) => (
                <MenuItem key={item.value} value={item.value}>
                  {item.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <CronFieldSelect
              label={text.minute}
              values={cronBuilder.minutes}
              options={minuteOptions}
              onChange={(values) => setCronBuilder((current) => ({ ...current, type: 'custom', minutes: values }))}
              allLabel={text.everyMinute}
            />
            <CronFieldSelect
              label={text.hour}
              values={cronBuilder.hours}
              options={hourOptions}
              onChange={(values) => setCronBuilder((current) => ({ ...current, type: 'custom', hours: values }))}
              allLabel={text.everyHour}
            />
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <CronFieldSelect
              label={text.monthDay}
              values={cronBuilder.monthDays}
              options={monthDayOptions}
              onChange={(values) => setCronBuilder((current) => ({ ...current, type: 'custom', monthDays: values }))}
              allLabel={text.everyMonthDay}
              helperText={text.monthDayHelper}
            />
            <CronFieldSelect
              label={text.month}
              values={cronBuilder.months}
              options={monthOptions}
              onChange={(values) => setCronBuilder((current) => ({ ...current, type: 'custom', months: values }))}
              allLabel={text.everyMonth}
            />
          </Stack>

          <CronFieldSelect
            label={text.weekDay}
            values={cronBuilder.weekDays}
            options={weekDayOptions}
            onChange={(values) => setCronBuilder((current) => ({ ...current, type: 'custom', weekDays: values }))}
            allLabel={text.everyWeekDay}
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
              {text.preview}
            </Typography>
            <Typography variant="subtitle1" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
              {cronPreview}
            </Typography>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{text.cancel}</Button>
        <Button variant="contained" onClick={() => onApply(cronPreview)}>
          {text.apply}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

CronFieldSelect.propTypes = {
  label: PropTypes.string,
  values: PropTypes.array,
  options: PropTypes.array,
  onChange: PropTypes.func,
  allLabel: PropTypes.string,
  helperText: PropTypes.string
};

CronBuilderDialog.propTypes = {
  open: PropTypes.bool,
  value: PropTypes.string,
  onClose: PropTypes.func,
  onApply: PropTypes.func,
  labels: PropTypes.object
};
