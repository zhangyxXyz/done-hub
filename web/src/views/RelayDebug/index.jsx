import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Tab,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { Icon } from '@iconify/react';
import dayjs from 'dayjs';
import { API } from 'utils/api';
import { showError, showSuccess } from 'utils/common';
import Label from 'ui-component/Label';
import hljs from 'ui-component/highlight';
import 'assets/css/dracula.css';
import { useTranslation } from 'react-i18next';

const ttlOptions = [5, 10, 30, 60];

const statusColor = (status) => {
  if (!status) return 'default';
  if (status >= 500) return 'error';
  if (status >= 400) return 'warning';
  if (status >= 300) return 'info';
  return 'success';
};

const kindColor = (kind) => {
  const normalized = `${kind || ''}`.toLowerCase();
  if (normalized.includes('system')) return 'info';
  if (normalized.includes('user')) return 'success';
  if (normalized.includes('assistant')) return 'primary';
  if (normalized.includes('tool')) return 'warning';
  if (normalized.includes('reasoning')) return 'secondary';
  return 'default';
};

const compactPath = (entry) => {
  const query = entry?.query ? `?${entry.query}` : '';
  return `${entry?.path || '-'}${query}`;
};

const formatTime = (value) => {
  if (!value) return '-';
  return dayjs.unix(value).format('HH:mm:ss');
};

const formatDateTime = (value) => {
  if (!value) return '-';
  return dayjs.unix(value).format('YYYY-MM-DD HH:mm:ss');
};

const fieldText = (fields) =>
  (fields || [])
    .map((field) => `field: ${field.name || '-'}\ncontent:\n${field.content || ''}`)
    .join('\n\n');

const fallbackFields = (raw, name = 'body') => {
  if (!raw) return [];
  return [{ name, content: raw, kind: 'raw' }];
};

const hasEntryDetail = (entry) =>
  Boolean(
    entry &&
      (entry.request_body ||
        entry.response_body ||
        entry.request_fields?.length ||
        entry.response_fields?.length)
  );

const labelColorByKind = (kind) => {
  const normalized = `${kind || ''}`.toLowerCase();
  if (normalized.includes('system')) return 'info';
  if (normalized.includes('user')) return 'success';
  if (normalized.includes('assistant')) return 'primary';
  if (normalized.includes('tool')) return 'warning';
  if (normalized.includes('reasoning')) return 'secondary';
  if (normalized.includes('error')) return 'error';
  return 'default';
};

const glassPanel = (theme, opacity = 0.72) => ({
  background:
    theme.palette.mode === 'dark'
      ? `linear-gradient(135deg, ${alpha('#1e3a5f', opacity * 0.46)} 0%, ${alpha('#071424', opacity * 0.72)} 100%)`
      : `linear-gradient(135deg, ${alpha('#ffffff', opacity)} 0%, ${alpha('#eff8ff', opacity * 0.8)} 100%)`,
  border: `1px solid ${theme.palette.mode === 'dark' ? alpha(theme.palette.divider, 0.86) : alpha('#2563eb', 0.14)}`,
  backdropFilter: 'blur(22px) saturate(170%)',
  WebkitBackdropFilter: 'blur(22px) saturate(170%)',
  boxShadow:
    theme.palette.mode === 'dark'
      ? `inset 0 1px 0 ${alpha('#ffffff', 0.08)}, 0 18px 42px ${alpha('#020617', 0.24)}`
      : `inset 0 1px 0 ${alpha('#ffffff', 0.82)}, 0 16px 36px ${alpha('#0f172a', 0.08)}`
});

const fieldAccent = (name = '') => {
  const key = `${name}`.toLowerCase();
  if (key.includes('request_id')) return { main: '#a78bfa', label: 'trace' };
  if (key.includes('captured') || key.includes('time')) return { main: '#22d3ee', label: 'time' };
  if (key.includes('method')) return { main: '#38bdf8', label: 'method' };
  if (key.includes('path')) return { main: '#60a5fa', label: 'route' };
  if (key.includes('status')) return { main: '#34d399', label: 'status' };
  if (key.includes('duration')) return { main: '#f59e0b', label: 'latency' };
  if (key.includes('token')) return { main: '#f472b6', label: 'token' };
  if (key.includes('channel')) return { main: '#c084fc', label: 'channel' };
  if (key.includes('model')) return { main: '#fb7185', label: 'model' };
  if (key.includes('stream')) return { main: '#2dd4bf', label: 'stream' };
  return { main: '#0ea5e9', label: 'field' };
};

const fieldCardSx = (theme) => ({
  ...glassPanel(theme, 0.62),
  background:
    theme.palette.mode === 'dark'
      ? alpha('#0b1b31', 0.68)
      : alpha('#ffffff', 0.66),
  borderColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.28 : 0.18),
  backdropFilter: 'blur(24px) saturate(160%)',
  WebkitBackdropFilter: 'blur(24px) saturate(160%)',
  boxShadow:
    theme.palette.mode === 'dark'
      ? `inset 0 1px 0 ${alpha('#ffffff', 0.07)}, 0 14px 34px ${alpha('#020617', 0.16)}`
      : `inset 0 1px 0 ${alpha('#ffffff', 0.9)}, 0 14px 30px ${alpha('#0f172a', 0.06)}`
});

const looksLikeJSON = (value) => {
  const trimmed = `${value || ''}`.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
};

const highlightContent = (value, language = 'auto', emptyText = 'No content') => {
  const code = `${value || emptyText}`;
  try {
    if (language === 'json' || looksLikeJSON(code)) {
      return hljs.highlight(code, { language: 'json', ignoreIllegals: true }).value;
    }
    return hljs.highlightAuto(code).value;
  } catch (error) {
    return hljs.highlight(code, { language: 'plaintext', ignoreIllegals: true }).value;
  }
};

const highlightSx = (theme) => ({
  '& .hljs': {
    display: 'block',
    p: 0,
    bgcolor: 'transparent',
    color: 'inherit'
  },
  '& .hljs-attr, & .hljs-property': {
    color: theme.palette.mode === 'dark' ? '#7dd3fc' : '#0369a1'
  },
  '& .hljs-string': {
    color: theme.palette.mode === 'dark' ? '#d9f99d' : '#0f766e'
  },
  '& .hljs-number, & .hljs-literal': {
    color: theme.palette.mode === 'dark' ? '#fcd34d' : '#b45309'
  },
  '& .hljs-punctuation': {
    color: theme.palette.mode === 'dark' ? alpha('#e5eefb', 0.7) : alpha('#334155', 0.72)
  },
  '& .hljs-keyword, & .hljs-built_in': {
    color: theme.palette.mode === 'dark' ? '#c4b5fd' : '#7c3aed'
  }
});

const HighlightCode = ({ value, language = 'auto', emptyText }) => (
  <Box
    component="code"
    className="hljs"
    dangerouslySetInnerHTML={{ __html: highlightContent(value, language, emptyText) }}
  />
);

const FieldPanel = ({ fields, t }) => {
  const visibleFields = fields?.length ? fields : fallbackFields('', 'body');
  const metricFields = visibleFields.filter((field) => field.kind === 'meta' && `${field.content || ''}`.length <= 120);
  const bodyFields = visibleFields.filter((field) => !(field.kind === 'meta' && `${field.content || ''}`.length <= 120));

  if (!visibleFields.length) {
    return (
      <Box sx={{ py: 8, textAlign: 'center', color: 'text.secondary' }}>
        <Icon width={30} icon="solar:inbox-line-bold-duotone" />
        <Typography sx={{ mt: 1 }}>{t('relay_debug.noFields')}</Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={1.25}>
      {metricFields.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' },
            gap: 1,
            width: '100%'
          }}
        >
          {metricFields.map((field, index) => (
            <Box key={`${field.name}-${index}`} sx={{ minWidth: 0 }}>
              <Box
                sx={(theme) => ({
                  ...fieldCardSx(theme),
                  px: 1.2,
                  py: 1,
                  borderRadius: 1.5,
                  minHeight: 72,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.75
                })}
              >
                <Stack direction="row" alignItems="center" spacing={0.75}>
                  <Box
                    sx={(theme) => ({
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      bgcolor: 'primary.main',
                      boxShadow: `0 0 0 4px ${alpha(theme.palette.primary.main, 0.14)}`,
                      flexShrink: 0
                    })}
                  />
                  <Box
                    sx={(theme) => ({
                      px: 0.75,
                      py: 0.35,
                      borderRadius: 1,
                      color: theme.palette.mode === 'dark' ? 'primary.light' : 'primary.dark',
                      bgcolor:
                        theme.palette.mode === 'dark'
                          ? alpha(theme.palette.primary.main, 0.12)
                          : alpha(theme.palette.primary.main, 0.16),
                      border: `1px solid ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.18 : 0.3)}`,
                      fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                      fontSize: 11,
                      fontWeight: 800,
                      lineHeight: 1.1,
                      wordBreak: 'break-word'
                    })}
                  >
                    {field.name || '-'}
                  </Box>
                </Stack>
                <Typography
                  title={field.content || ''}
                  sx={{
                    fontWeight: 850,
                    fontSize: `${field.content || ''}`.length > 26 ? 14 : 18,
                    lineHeight: 1.28,
                    color: 'text.primary',
                    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                    whiteSpace: 'normal',
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    pl: 2.05
                  }}
                >
                  {field.content || '-'}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {bodyFields.map((field, index) => (
          <Box
            key={`${field.name}-${index}`}
            sx={(theme) => ({
              ...fieldCardSx(theme),
              borderRadius: 1.5,
              overflow: 'hidden'
            })}
          >
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              spacing={1}
              sx={{ px: 1.25, pt: 1.1, pb: 0.75 }}
            >
              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
                <Box
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    bgcolor: 'primary.main',
                    boxShadow: (theme) => `0 0 0 4px ${alpha(theme.palette.primary.main, 0.14)}`,
                    flexShrink: 0
                  }}
                />
                <Box
                  sx={(theme) => ({
                    px: 0.75,
                    py: 0.35,
                    borderRadius: 1,
                    color: theme.palette.mode === 'dark' ? 'primary.light' : 'primary.dark',
                    bgcolor:
                      theme.palette.mode === 'dark'
                        ? alpha(theme.palette.primary.main, 0.12)
                        : alpha(theme.palette.primary.main, 0.16),
                    border: `1px solid ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.18 : 0.3)}`,
                    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                    fontSize: 11,
                    fontWeight: 800,
                    lineHeight: 1.1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '100%'
                  })}
                >
                  {field.name || '-'}
                </Box>
              </Stack>
              <Label variant="soft" color={labelColorByKind(field.kind)}>
                {field.kind || 'field'}
              </Label>
            </Stack>
            <Box
              sx={(theme) => ({
                ml: '29px',
                mr: 1.25,
                mb: 1.15,
                px: 0,
                py: 0.6,
                maxHeight: 360,
                overflow: 'auto',
                borderRadius: 0,
                border: 0,
                bgcolor: 'transparent',
                color: 'text.primary',
                fontSize: 13,
                lineHeight: 1.7,
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                scrollbarWidth: 'thin',
                scrollbarColor: `${alpha(theme.palette.primary.main, 0.34)} transparent`,
                '&::-webkit-scrollbar': {
                  width: 5,
                  height: 5
                },
                '&::-webkit-scrollbar-track': {
                  background: 'transparent'
                },
                '&::-webkit-scrollbar-thumb': {
                  borderRadius: 8,
                  backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.34 : 0.26)
                },
                '&::-webkit-scrollbar-thumb:hover': {
                  backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.48 : 0.38)
                },
                ...highlightSx(theme)
              })}
            >
              <HighlightCode value={field.content} emptyText={t('relay_debug.noContent')} />
            </Box>
          </Box>
      ))}
    </Stack>
  );
};

const RawPanel = ({ value, t }) => (
  <Box
    component="pre"
    sx={(theme) => ({
      m: 0,
      p: 2,
      minHeight: 360,
      maxHeight: '62vh',
      overflow: 'auto',
      borderRadius: 1.5,
      bgcolor: theme.palette.mode === 'dark' ? alpha('#071424', 0.7) : alpha('#ffffff', 0.62),
      color: theme.palette.mode === 'dark' ? alpha('#e5eefb', 0.95) : alpha('#1e293b', 0.95),
      fontSize: 13,
      lineHeight: 1.65,
      fontFamily: 'Consolas, Monaco, "Courier New", monospace',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      border: `1px solid ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.18 : 0.16)}`,
      backdropFilter: 'blur(24px) saturate(155%)',
      boxShadow:
        theme.palette.mode === 'dark'
          ? `inset 0 1px 0 ${alpha('#ffffff', 0.06)}, 0 14px 34px ${alpha('#020617', 0.18)}`
          : `inset 0 1px 0 ${alpha('#ffffff', 0.9)}, 0 14px 30px ${alpha('#0f172a', 0.06)}`,
      ...highlightSx(theme)
    })}
  >
    <HighlightCode value={value} language="json" emptyText={t('relay_debug.noContent')} />
  </Box>
);

const RelayDebug = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [state, setState] = useState({ enabled: false, count: 0, max_entries: 100, expires_at: 0 });
  const [entries, setEntries] = useState([]);
  const [detailsById, setDetailsById] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [ttl, setTtl] = useState(10);
  const [tab, setTab] = useState('request');
  const [viewMode, setViewMode] = useState('fields');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filterUserId, setFilterUserId] = useState(0);
  const [filterTokenId, setFilterTokenId] = useState(0);
  const [userOptions, setUserOptions] = useState([]);
  const [tokenOptions, setTokenOptions] = useState([]);
  const syncCursorRef = useRef({ nextId: 0, count: 0 });

  const fetchData = useCallback(async(silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = { page: 1, limit: 100 };
      if (silent) {
        params.known_next_id = syncCursorRef.current.nextId;
        params.known_count = syncCursorRef.current.count;
      }
      const res = await API.get('/api/debug/relay-io', { params });
      const { success, message, data } = res.data;
      if (!success) {
        showError(message);
        return;
      }
      setState(data.state || {});
      if (data.state?.enabled) {
        setFilterUserId(data.state.filter_user_id || 0);
        setFilterTokenId(data.state.filter_token_id || 0);
      }
      syncCursorRef.current = {
        nextId: data.state?.next_id || 0,
        count: data.state?.count || 0
      };
      if (data.changed === false) {
        return;
      }
      const nextEntries = data.entries || [];
      setEntries(nextEntries);
      setSelectedId((current) => {
        if (nextEntries.length === 0) return null;
        if (current && nextEntries.some((item) => item.id === current)) return current;
        return null;
      });
    } catch (error) {
      console.error(error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const fetchFilterOptions = useCallback(async(userId = 0) => {
    try {
      const [usersRes, tokensRes] = await Promise.all([
        API.get('/api/user/', { params: { page: 1, size: 100, order: 'id' } }),
        API.get('/api/token/admin/search', {
          params: {
            page: 1,
            size: 100,
            order: 'id',
            user_id: userId || undefined
          }
        })
      ]);

      if (usersRes.data?.success) {
        setUserOptions(usersRes.data.data?.data || []);
      }
      if (tokensRes.data?.success) {
        setTokenOptions(tokensRes.data.data?.data || []);
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  const fetchDetail = useCallback(async(id) => {
    if (!id || detailsById[id]) return;
    const listEntry = entries.find((entry) => entry.id === id);
    if (hasEntryDetail(listEntry)) {
      setDetailsById((old) => ({ ...old, [id]: listEntry }));
      return;
    }

    setDetailLoading(true);
    try {
      const res = await API.get(`/api/debug/relay-io/${id}`, { validateStatus: () => true });
      if (res.status === 404) {
        if (listEntry) {
          setDetailsById((old) => ({ ...old, [id]: listEntry }));
        }
        return;
      }
      const { success, message, data } = res.data;
      if (!success) {
        showError(message);
        return;
      }
      setDetailsById((old) => ({ ...old, [id]: data }));
    } catch (error) {
      console.error(error);
    } finally {
      setDetailLoading(false);
    }
  }, [detailsById, entries]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchFilterOptions(filterUserId);
  }, [fetchFilterOptions, filterUserId]);

  useEffect(() => {
    if (!autoRefresh || !state.enabled) return undefined;
    const timer = setInterval(() => fetchData(true), 5000);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchData, state.enabled]);

  useEffect(() => {
    fetchDetail(selectedId);
  }, [fetchDetail, selectedId]);

  const selected = useMemo(
    () => detailsById[selectedId] || entries.find((entry) => entry.id === selectedId) || null,
    [detailsById, entries, selectedId]
  );
  const selectedDetailLoaded = hasEntryDetail(selected);
  const activeFilterText = useMemo(() => {
    const user = userOptions.find((item) => item.id === filterUserId);
    const token = tokenOptions.find((item) => item.id === filterTokenId);
    return [
      user
        ? t('relay_debug.userFilterValue', { id: user.id, name: user.display_name || user.username || '-' })
        : filterUserId
        ? t('relay_debug.userFilterId', { id: filterUserId })
        : t('relay_debug.allUsers'),
      token
        ? t('relay_debug.tokenFilterValue', { id: token.id, name: token.name || '-' })
        : filterTokenId
        ? t('relay_debug.tokenFilterId', { id: filterTokenId })
        : t('relay_debug.allSk')
    ].join(' / ');
  }, [filterTokenId, filterUserId, t, tokenOptions, userOptions]);

  const metaFields = useMemo(() => {
    if (!selected) return [];
    return [
      { name: 'request_id', content: selected.request_id || '-', kind: 'meta' },
      { name: 'captured_at', content: formatDateTime(selected.captured_at), kind: 'meta' },
      { name: 'method', content: selected.method || '-', kind: 'meta' },
      { name: 'path', content: compactPath(selected), kind: 'meta' },
      { name: 'status', content: `${selected.status || '-'}`, kind: 'meta' },
      { name: 'duration_ms', content: `${selected.duration_ms || 0}`, kind: 'meta' },
      { name: 'token_name', content: selected.token_name || '-', kind: 'meta' },
      { name: 'channel_id', content: `${selected.channel_id || '-'}`, kind: 'meta' },
      { name: 'model', content: selected.new_model || selected.original_model || '-', kind: 'meta' },
      { name: 'stream', content: selected.is_stream ? 'true' : 'false', kind: 'meta' }
    ];
  }, [selected]);

  const updateEnabled = async(enabled) => {
    setLoading(true);
    try {
      const res = await API.put('/api/debug/relay-io', {
        enabled,
        ttl_minutes: ttl,
        filter_user_id: filterUserId,
        filter_token_id: filterTokenId
      });
      const { success, message, data } = res.data;
      if (!success) {
        showError(message);
        return;
      }
      setState((old) => ({ ...old, ...data }));
      syncCursorRef.current = {
        nextId: data?.next_id || 0,
        count: data?.count || 0
      };
      showSuccess(enabled ? t('relay_debug.captureEnabled') : t('relay_debug.captureDisabled'));
      fetchData(true);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const clearEntries = async() => {
    setLoading(true);
    try {
      const res = await API.delete('/api/debug/relay-io');
      const { success, message, data } = res.data;
      if (!success) {
        showError(message);
        return;
      }
      setState((old) => ({ ...old, ...data }));
      syncCursorRef.current = {
        nextId: data?.next_id || 0,
        count: data?.count || 0
      };
      setEntries([]);
      setDetailsById({});
      setSelectedId(null);
      showSuccess(t('relay_debug.cleared'));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const activeFields =
    tab === 'request'
      ? selected?.request_fields?.length
        ? selected.request_fields
        : fallbackFields(selected?.request_body, 'request.body')
      : tab === 'response'
      ? selected?.response_fields?.length
        ? selected.response_fields
        : fallbackFields(selected?.response_body, 'response.body')
      : metaFields;

  const rawValue =
    tab === 'request'
      ? selected?.request_body
      : tab === 'response'
      ? selected?.response_body
      : JSON.stringify(Object.fromEntries(metaFields.map((item) => [item.name, item.content])), null, 2);

  const copyText = async() => {
    const text = viewMode === 'fields' ? fieldText(activeFields) : rawValue;
    await navigator.clipboard.writeText(text || '');
    showSuccess(t('relay_debug.copied'));
  };

  return (
    <Box sx={{ mt: 2 }}>
      {loading && <LinearProgress sx={{ mb: 2, borderRadius: 1 }} />}
      <Stack spacing={2}>
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, md: 3 },
            borderRadius: 3,
            border: `1px solid ${alpha(theme.palette.primary.main, 0.22)}`,
            background:
              theme.palette.mode === 'dark'
                ? `linear-gradient(135deg, ${alpha('#0b1630', 0.98)}, ${alpha('#053d46', 0.82)})`
                : `linear-gradient(135deg, ${alpha('#ffffff', 0.76)} 0%, ${alpha('#eaf5ff', 0.7)} 48%, ${alpha('#e7fbf5', 0.66)} 100%)`,
            backdropFilter: 'blur(22px) saturate(150%)',
            boxShadow: `0 20px 60px ${alpha(theme.palette.common.black, theme.palette.mode === 'dark' ? 0.28 : 0.07)}`
          }}
        >
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2.5}>
            <Box>
              <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 1 }}>
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: 2,
                    display: 'grid',
                    placeItems: 'center',
                    color: 'primary.main',
                    bgcolor: alpha(theme.palette.primary.main, 0.12),
                    border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`
                  }}
                >
                  <Icon width={24} icon="solar:bug-bold-duotone" />
                </Box>
                <Typography variant="h2" sx={{ fontSize: { xs: 24, md: 30 }, letterSpacing: 0 }}>
                  {t('relay_debug.title')}
                </Typography>
                <Chip
                  size="small"
                  label={state.enabled ? t('relay_debug.enabled') : t('relay_debug.disabled')}
                  variant="outlined"
                  sx={{
                    bgcolor: state.enabled
                      ? theme.palette.mode === 'dark'
                        ? alpha(theme.palette.success.main, 0.16)
                        : alpha(theme.palette.success.main, 0.1)
                      : alpha(theme.palette.text.secondary, 0.06),
                    borderColor: state.enabled ? alpha(theme.palette.success.main, 0.38) : alpha(theme.palette.text.secondary, 0.22),
                    color: state.enabled
                      ? theme.palette.mode === 'dark'
                        ? theme.palette.success.light
                        : theme.palette.success.dark
                      : 'text.secondary',
                    fontWeight: 700
                  }}
                />
              </Stack>
              <Typography color="text.secondary">
                {t('relay_debug.description', { count: state.max_entries || 100 })}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ rowGap: 1.25 }}>
              <FormControl size="small" sx={{ minWidth: 190 }}>
                <InputLabel id="relay-debug-user-filter">{t('relay_debug.user')}</InputLabel>
                <Select
                  labelId="relay-debug-user-filter"
                  value={filterUserId}
                  label={t('relay_debug.user')}
                  disabled={state.enabled}
                  onChange={(event) => {
                    setFilterUserId(Number(event.target.value) || 0);
                    setFilterTokenId(0);
                  }}
                >
                  <MenuItem value={0}>{t('relay_debug.allUsers')}</MenuItem>
                  {userOptions.map((user) => (
                    <MenuItem key={user.id} value={user.id}>
                      {user.id} - {user.display_name || user.username || '-'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 190 }}>
                <InputLabel id="relay-debug-token-filter">SK</InputLabel>
                <Select
                  labelId="relay-debug-token-filter"
                  value={filterTokenId}
                  label="SK"
                  disabled={state.enabled}
                  onChange={(event) => setFilterTokenId(Number(event.target.value) || 0)}
                >
                  <MenuItem value={0}>{t('relay_debug.allSk')}</MenuItem>
                  {tokenOptions.map((token) => (
                    <MenuItem key={token.id} value={token.id}>
                      {token.id} - {token.name || '-'}{token.owner_name ? ` (${token.owner_name})` : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 112 }}>
                <InputLabel id="relay-debug-ttl">{t('relay_debug.duration')}</InputLabel>
                <Select labelId="relay-debug-ttl" value={ttl} label={t('relay_debug.duration')} onChange={(event) => setTtl(event.target.value)}>
                  {ttlOptions.map((item) => (
                    <MenuItem key={item} value={item}>
                      {t('relay_debug.minutes', { count: item })}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Tooltip title={state.enabled ? t('relay_debug.closeCapture') : t('relay_debug.openCapture')}>
                <Switch checked={Boolean(state.enabled)} onChange={(event) => updateEnabled(event.target.checked)} />
              </Tooltip>
              <Tooltip title={t('relay_debug.refresh')}>
                <IconButton color="primary" onClick={() => fetchData()}>
                  <Icon width={22} icon="solar:refresh-bold-duotone" />
                </IconButton>
              </Tooltip>
              <Tooltip title={t('relay_debug.clear')}>
                <span>
                  <IconButton color="error" onClick={clearEntries} disabled={!entries.length}>
                    <Icon width={22} icon="solar:trash-bin-trash-bold-duotone" />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ xs: 'flex-start', sm: 'center' }} flexWrap="wrap" useFlexGap>
            <Chip
              icon={<Icon icon="solar:database-bold-duotone" />}
              label={`${state.count || entries.length} / ${state.max_entries || 100}`}
              variant="outlined"
              sx={{
                bgcolor: theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.06) : '#ffffff',
                color: 'text.primary',
                borderColor: theme.palette.mode === 'dark' ? 'divider' : alpha(theme.palette.primary.main, 0.18),
                '& .MuiChip-icon': { color: 'primary.main' }
              }}
            />
            <Chip
              icon={<Icon icon="solar:clock-circle-bold-duotone" />}
              label={t('relay_debug.expiresAt', { time: formatDateTime(state.expires_at) })}
              variant="outlined"
              sx={{
                bgcolor: theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.06) : '#ffffff',
                color: 'text.primary',
                borderColor: theme.palette.mode === 'dark' ? 'divider' : alpha(theme.palette.primary.main, 0.18),
                '& .MuiChip-icon': { color: 'primary.main' }
              }}
            />
            <Chip
              icon={<Icon icon="solar:shield-keyhole-bold-duotone" />}
              label={t('relay_debug.tokenHidden')}
              color="primary"
              variant="outlined"
              sx={{
                bgcolor: theme.palette.mode === 'dark' ? alpha(theme.palette.primary.main, 0.08) : '#ffffff',
                borderColor: theme.palette.mode === 'dark' ? alpha(theme.palette.primary.main, 0.4) : alpha(theme.palette.primary.main, 0.28)
              }}
            />
            <Chip
              icon={<Icon icon="solar:filter-bold-duotone" />}
              label={state.enabled ? t('relay_debug.listening', { filter: activeFilterText }) : t('relay_debug.nextListening', { filter: activeFilterText })}
              variant="outlined"
              sx={{
                bgcolor: theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.06) : '#ffffff',
                color: 'text.primary',
                borderColor: theme.palette.mode === 'dark' ? 'divider' : alpha(theme.palette.primary.main, 0.18),
                '& .MuiChip-icon': { color: 'primary.main' }
              }}
            />
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="body2" color="text.secondary">
                {t('relay_debug.autoRefresh')}
              </Typography>
              <Switch size="small" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
            </Stack>
          </Stack>
        </Paper>

        {!state.enabled && (
          <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
            {t('relay_debug.inactiveHint')}
          </Alert>
        )}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(360px, 0.56fr) minmax(0, 1fr)' },
            gap: 2,
            alignItems: 'stretch',
            width: '100%'
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Paper
              elevation={0}
              sx={{
                border: `1px solid ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.22 : 0.16)}`,
                borderRadius: 3,
                overflow: 'hidden',
                minHeight: isDesktop ? '66vh' : 'auto',
                background:
                  theme.palette.mode === 'dark'
                    ? `linear-gradient(135deg, ${alpha('#10213a', 0.54)} 0%, ${alpha('#062f39', 0.46)} 100%)`
                    : `linear-gradient(135deg, ${alpha('#ffffff', 0.68)} 0%, ${alpha('#edf8ff', 0.56)} 100%)`,
                backdropFilter: 'blur(24px) saturate(160%)',
                WebkitBackdropFilter: 'blur(24px) saturate(160%)',
                boxShadow:
                  theme.palette.mode === 'dark'
                    ? `inset 0 1px 0 ${alpha('#ffffff', 0.06)}, 0 18px 46px ${alpha('#020617', 0.18)}`
                    : `inset 0 1px 0 ${alpha('#ffffff', 0.86)}, 0 18px 44px ${alpha('#0f172a', 0.08)}`
              }}
            >
              <Box sx={{ px: 2, py: 1.75, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="h4">{t('relay_debug.recentRequests')}</Typography>
                <Chip
                  size="small"
                  label={t('relay_debug.entryCount', { count: entries.length })}
                  variant="outlined"
                  sx={{
                    bgcolor: theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.06) : alpha('#ffffff', 0.76),
                    color: 'text.primary',
                    borderColor: theme.palette.mode === 'dark' ? 'divider' : alpha(theme.palette.primary.main, 0.18),
                    fontWeight: 700
                  }}
                />
              </Box>
              <Divider />
              <Stack spacing={1} sx={{ p: 1.25, maxHeight: isDesktop ? '68vh' : 420, overflow: 'auto' }}>
                {entries.map((entry) => (
                  <Box
                    key={entry.id}
                    onClick={() => setSelectedId(entry.id)}
                    sx={(theme) => ({
                      p: 1.05,
                      borderRadius: 2,
                      cursor: 'pointer',
                      border: '1px solid',
                      borderColor:
                        selected?.id === entry.id
                          ? alpha(theme.palette.primary.main, 0.8)
                          : alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.16 : 0.12),
                      background:
                        selected?.id === entry.id
                          ? theme.palette.mode === 'dark'
                            ? `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.16)} 0%, ${alpha('#082033', 0.58)} 100%)`
                            : `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha('#ffffff', 0.72)} 100%)`
                          : theme.palette.mode === 'dark'
                          ? `linear-gradient(135deg, ${alpha('#17233a', 0.58)} 0%, ${alpha('#071424', 0.48)} 100%)`
                          : `linear-gradient(135deg, ${alpha('#ffffff', 0.58)} 0%, ${alpha('#f0f8ff', 0.44)} 100%)`,
                      backdropFilter: 'blur(18px) saturate(155%)',
                      WebkitBackdropFilter: 'blur(18px) saturate(155%)',
                      boxShadow:
                        selected?.id === entry.id
                          ? `inset 0 1px 0 ${alpha('#ffffff', theme.palette.mode === 'dark' ? 0.06 : 0.78)}, 0 12px 28px ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.1 : 0.08)}`
                          : `inset 0 1px 0 ${alpha('#ffffff', theme.palette.mode === 'dark' ? 0.04 : 0.64)}`,
                      transition: 'border-color .15s ease, background .15s ease, box-shadow .15s ease',
                      '&:hover': {
                        borderColor: alpha(theme.palette.primary.main, 0.55),
                        background:
                          theme.palette.mode === 'dark'
                            ? `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.12)} 0%, ${alpha('#082033', 0.54)} 100%)`
                            : `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${alpha('#ffffff', 0.7)} 100%)`
                      }
                    })}
                  >
                    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                        <Label color="primary" variant="soft">
                          {entry.method || '-'}
                        </Label>
                        <Typography noWrap title={compactPath(entry)} sx={{ fontWeight: 800 }}>
                          {compactPath(entry)}
                        </Typography>
                      </Stack>
                      <Label color={statusColor(entry.status)} variant="soft" title={t('relay_debug.httpStatusCode')}>
                        {entry.status ? `HTTP ${entry.status}` : '-'}
                      </Label>
                    </Stack>
                    <Stack
                      direction="row"
                      spacing={0.65}
                      alignItems="center"
                      flexWrap="wrap"
                      useFlexGap
                      sx={{ mt: 0.85, color: 'text.secondary' }}
                    >
                      <Label variant="soft">{formatTime(entry.captured_at)}</Label>
                      <Label variant="soft">#{entry.id}</Label>
                      <Label color="info" variant="soft">
                        {entry.new_model || entry.original_model || '-'}
                      </Label>
                      <Label color="secondary" variant="soft">
                        {entry.duration_ms}ms
                      </Label>
                      <Label color={entry.is_stream ? 'primary' : 'default'} variant="outlined">
                        {entry.is_stream ? 'stream' : 'non-stream'}
                      </Label>
                      <Label
                        variant="soft"
                        title={entry.token_name || '-'}
                        sx={(theme) => ({
                          maxWidth: 112,
                          color: theme.palette.mode === 'dark' ? alpha(theme.palette.error.light, 0.78) : alpha(theme.palette.error.dark, 0.72),
                          bgcolor: alpha(theme.palette.error.main, theme.palette.mode === 'dark' ? 0.08 : 0.07),
                          border: `1px solid ${alpha(theme.palette.error.main, theme.palette.mode === 'dark' ? 0.1 : 0.08)}`,
                          '& .MuiTypography-root': {
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }
                        })}
                      >
                        {entry.token_name || '-'}
                      </Label>
                    </Stack>
                  </Box>
                ))}
                {entries.length === 0 && (
                  <Box sx={{ py: 8, textAlign: 'center', color: 'text.secondary' }}>
                    <Icon width={30} icon="solar:inbox-line-bold-duotone" />
                    <Typography sx={{ mt: 1 }}>{t('relay_debug.noRequests')}</Typography>
                  </Box>
                )}
              </Stack>
            </Paper>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Paper
              elevation={0}
              sx={{
                border: `1px solid ${theme.palette.mode === 'dark' ? theme.palette.divider : '#d7e3f2'}`,
                borderRadius: 3,
                overflow: 'hidden',
                bgcolor: theme.palette.mode === 'dark' ? alpha(theme.palette.background.paper, 0.8) : alpha('#ffffff', 0.66),
                backdropFilter: 'blur(20px) saturate(150%)',
                boxShadow: theme.palette.mode === 'dark' ? 'none' : `0 18px 44px ${alpha('#0f172a', 0.08)}`
              }}
            >
              <Box sx={{ px: 2, py: 1.75 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.5}>
                  <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
                    <Box
                      sx={{
                        width: 38,
                        height: 38,
                        borderRadius: 2,
                        display: 'grid',
                        placeItems: 'center',
                        color: 'primary.main',
                        bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.14 : 0.1),
                        border: `1px solid ${alpha(theme.palette.primary.main, 0.22)}`,
                        flexShrink: 0
                      }}
                    >
                      <Icon width={21} icon="solar:route-bold-duotone" />
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ minWidth: 0 }}>
                        <Box
                          title={selected ? compactPath(selected) : ''}
                          sx={(theme) => ({
                            px: 0.85,
                            py: 0.42,
                            borderRadius: 1.25,
                            maxWidth: { xs: 260, md: 360 },
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            color: theme.palette.mode === 'dark' ? 'primary.light' : 'primary.dark',
                            fontWeight: 800,
                            fontSize: 13,
                            lineHeight: 1.2,
                            letterSpacing: 0,
                            bgcolor:
                              theme.palette.mode === 'dark'
                                ? alpha(theme.palette.primary.main, 0.14)
                                : alpha(theme.palette.primary.main, 0.1),
                            border: `1px solid ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.18 : 0.2)}`,
                            fontFamily: 'Consolas, Monaco, "Courier New", monospace'
                          })}
                        >
                          {selected ? compactPath(selected) : t('relay_debug.requestDetail')}
                        </Box>
                        {selected && (
                          <Label color={selected.is_stream ? 'primary' : 'default'} variant="soft">
                            {selected.is_stream ? 'stream merged' : 'non-stream'}
                          </Label>
                        )}
                      </Stack>
                      <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.65 }}>
                        <Box
                          title={selected?.request_id || ''}
                          sx={(theme) => ({
                            px: 0.85,
                            py: 0.36,
                            borderRadius: 1,
                            maxWidth: { xs: 260, md: 360 },
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            color: 'text.secondary',
                            bgcolor: theme.palette.mode === 'dark' ? alpha('#94a3b8', 0.12) : alpha('#64748b', 0.08),
                            border: `1px solid ${theme.palette.mode === 'dark' ? alpha('#94a3b8', 0.12) : alpha('#64748b', 0.1)}`,
                            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                            fontSize: 12,
                            lineHeight: 1.2
                          })}
                        >
                          {selected?.request_id || t('relay_debug.selectRecord')}
                        </Box>
                        {selected && <Label variant="soft">{formatDateTime(selected.captured_at)}</Label>}
                      </Stack>
                    </Box>
                  </Stack>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <ToggleButtonGroup
                      exclusive
                      size="small"
                      value={viewMode}
                      onChange={(event, value) => value && setViewMode(value)}
                    >
                      <ToggleButton value="fields">Fields</ToggleButton>
                      <ToggleButton value="raw">Raw</ToggleButton>
                    </ToggleButtonGroup>
                    <Tooltip title={t('relay_debug.copyCurrent')}>
                      <span>
                        <IconButton disabled={!selected || !selectedDetailLoaded} onClick={copyText}>
                          <Icon width={22} icon="solar:copy-bold-duotone" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                </Stack>
              </Box>
              <Divider />
              <Tabs value={tab} onChange={(event, value) => setTab(value)} sx={{ px: 2 }}>
                <Tab value="request" label="Request" />
                <Tab value="response" label="Response" />
                <Tab value="meta" label="Meta" />
              </Tabs>
              <Box sx={{ p: 2, maxHeight: isDesktop ? '70vh' : 'none', overflow: 'auto' }}>
                {detailLoading && !selectedDetailLoaded ? (
                  <Stack spacing={1.25} sx={{ py: 6, alignItems: 'center', color: 'text.secondary' }}>
                    <LinearProgress sx={{ width: 180, borderRadius: 1 }} />
                    <Typography>{t('relay_debug.loadingDetail')}</Typography>
                  </Stack>
                ) : viewMode === 'fields' ? (
                  <FieldPanel fields={activeFields} t={t} />
                ) : (
                  <RawPanel value={rawValue} t={t} />
                )}
              </Box>
            </Paper>
          </Box>
        </Box>
      </Stack>
    </Box>
  );
};

export default RelayDebug;

