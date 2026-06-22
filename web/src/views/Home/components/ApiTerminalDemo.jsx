import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Box, Stack, Typography, alpha } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from 'framer-motion';
import { API } from 'utils/api';
import { FALLBACK_MODEL_STEPS, MODEL_TABS, buildStepsFromModelInfo } from './homeModelInfo';
import { MONO } from './styles';

const TYPE_MS = 24;
const HOLD_MS = 2600;
const LEAD_MS = 360;
const MODEL_INFO_CACHE_KEY = 'donehub_home_model_info_steps_v11';
const MODEL_INFO_CACHE_TTL = 10 * 60 * 1000;

let modelInfoStepsCache = null;
let modelInfoStepsPromise = null;

const readCachedSteps = () => {
  if (modelInfoStepsCache && Date.now() - modelInfoStepsCache.timestamp < MODEL_INFO_CACHE_TTL) {
    return modelInfoStepsCache.steps;
  }

  if (typeof window === 'undefined') return null;

  try {
    const cached = JSON.parse(window.localStorage.getItem(MODEL_INFO_CACHE_KEY) || 'null');
    if (cached?.steps && Date.now() - cached.timestamp < MODEL_INFO_CACHE_TTL) {
      modelInfoStepsCache = cached;
      return cached.steps;
    }
  } catch (error) {
    window.localStorage.removeItem(MODEL_INFO_CACHE_KEY);
  }

  return null;
};

const writeCachedSteps = (steps) => {
  modelInfoStepsCache = { steps, timestamp: Date.now() };

  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(MODEL_INFO_CACHE_KEY, JSON.stringify(modelInfoStepsCache));
  } catch (error) {
    window.localStorage.removeItem(MODEL_INFO_CACHE_KEY);
  }
};

const getProtocolSeparator = (language) => (String(language || '').startsWith('zh') || String(language || '').startsWith('ja') ? '、' : ', ');

const loadModelInfoSteps = async () => {
  const cached = readCachedSteps();
  if (cached) return cached;

  if (!modelInfoStepsPromise) {
    modelInfoStepsPromise = API.get('/api/model_info/')
      .then((res) => {
        const { success, data } = res.data || {};
        const steps = success ? buildStepsFromModelInfo(data) : FALLBACK_MODEL_STEPS;
        writeCachedSteps(steps);
        return steps;
      })
      .catch(() => FALLBACK_MODEL_STEPS)
      .finally(() => {
        modelInfoStepsPromise = null;
      });
  }

  return modelInfoStepsPromise;
};

// Interactive code window: pick a client, watch the request hit the same base URL
// on its native protocol and stream a reply back. The base comes from the
// configured server_address, falling back to the current origin — never a
// placeholder. Honors prefers-reduced-motion by rendering the settled frame.
const normalizeProtocols = (protocols) => {
  const values = Array.isArray(protocols) ? protocols : String(protocols || '').split(',');
  return values.map((value) => value.trim()).filter((value) => MODEL_TABS.includes(value));
};

const ApiTerminalDemo = ({ protocols: configuredProtocols }) => {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const reduce = useReducedMotion();
  const siteInfo = useSelector((state) => state.siteInfo);
  const base = (siteInfo?.server_address || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/+$/, '');
  const systemName = siteInfo?.system_name || 'Done Hub';
  const macDots = [
    { base: '#ff5f57', border: '#e0443e' },
    { base: '#ffbd2e', border: '#dea123' },
    { base: '#28c840', border: '#1aab29' }
  ];

  const allowedProtocols = normalizeProtocols(configuredProtocols);
  const initialSteps = allowedProtocols.length ? FALLBACK_MODEL_STEPS.filter((s) => allowedProtocols.includes(s.proto)) : FALLBACK_MODEL_STEPS;
  const [steps, setSteps] = useState(initialSteps.length ? initialSteps : FALLBACK_MODEL_STEPS);
  const [active, setActive] = useState(0);
  const [manual, setManual] = useState(false);
  const [typed, setTyped] = useState(0);

  const allowedTabs = allowedProtocols.length ? allowedProtocols : MODEL_TABS;
  const visibleTabs = allowedTabs.filter((tab) => steps.some((s) => s.proto === tab));
  const protocols = visibleTabs.length ? visibleTabs : allowedTabs;
  const step = steps[active] || steps[0] || FALLBACK_MODEL_STEPS[0];
  const displayModel = step.displayModel || step.model;
  const reply = t('home.code.reply', { model: displayModel, systemName });
  const protocolList = protocols.join(getProtocolSeparator(i18n.language));
  const title = protocols.length === MODEL_TABS.length ? t('home.code.title') : t('home.code.titleDynamic', { count: protocols.length });

  useEffect(() => {
    let cancelled = false;

    const fetchModelInfoSteps = async () => {
      const nextSteps = await loadModelInfoSteps();
      if (!cancelled) {
        const filteredSteps = allowedProtocols.length ? nextSteps.filter((s) => allowedProtocols.includes(s.proto)) : nextSteps;
        setSteps(filteredSteps.length ? filteredSteps : allowedProtocols.length ? initialSteps : nextSteps);
        setActive(0);
      }
    };

    fetchModelInfoSteps();

    return () => {
      cancelled = true;
    };
  }, [configuredProtocols]);

  useEffect(() => {
    const currentStep = steps[active] || FALLBACK_MODEL_STEPS[0];
    const currentDisplayModel = currentStep.displayModel || currentStep.model;
    const full = t('home.code.reply', { model: currentDisplayModel, systemName });
    if (reduce) {
      setTyped(full.length);
      return undefined;
    }

    let cancelled = false;
    let timer;
    setTyped(0);
    let n = 0;
    const type = () => {
      if (cancelled) return;
      n += 1;
      setTyped(n);
      if (n < full.length) {
        timer = setTimeout(type, TYPE_MS);
      } else if (!manual) {
        timer = setTimeout(() => {
          if (!cancelled && steps.length) setActive((a) => (a + 1) % steps.length);
        }, HOLD_MS);
      }
    };
    timer = setTimeout(type, LEAD_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, manual, reduce, steps, systemName, t]);

  const selectTab = (proto) => {
    const idx = steps.findIndex((s) => s.proto === proto);
    if (idx < 0) return;
    setManual(true);
    setActive(idx);
  };

  return (
    <Stack spacing={1.5} sx={{ width: '100%' }}>
      <Box
        sx={{
          width: '100%',
          borderRadius: '14px',
          border: `1px solid ${theme.palette.divider}`,
          bgcolor: theme.palette.background.paper,
          overflow: 'hidden'
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.5}
          sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${theme.palette.divider}` }}
        >
          <Stack direction="row" spacing={0.75}>
            {macDots.map((dot, i) => (
              <Box
                key={i}
                sx={{
                  width: 11,
                  height: 11,
                  borderRadius: '50%',
                  bgcolor: dot.base,
                  border: `1px solid ${dot.border}`,
                  boxShadow: `inset 0 -1px 0 ${alpha('#000', 0.12)}`
                }}
              />
            ))}
          </Stack>
          <Typography sx={{ color: theme.palette.text.secondary, fontFamily: MONO, fontSize: '0.78rem', fontWeight: 500 }}>
            {title}
          </Typography>
        </Stack>

        <Stack direction="row" spacing={0.5} sx={{ px: { xs: 1.5, sm: 2 }, py: 1.25, borderBottom: `1px solid ${theme.palette.divider}` }}>
          {protocols.map((tab) => {
            const on = step.proto === tab;
            return (
              <Box
                key={tab}
                component="button"
                type="button"
                aria-pressed={on}
                onClick={() => selectTab(tab)}
                sx={{
                  cursor: 'pointer',
                  border: 0,
                  appearance: 'none',
                  px: 1.25,
                  py: 0.5,
                  borderRadius: '7px',
                  fontFamily: MONO,
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  letterSpacing: '0.01em',
                  color: on ? theme.palette.primary.main : theme.palette.text.secondary,
                  bgcolor: on ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                  transition: 'color .2s ease, background-color .2s ease',
                  '&:hover': { color: on ? theme.palette.primary.main : theme.palette.text.primary }
                }}
              >
                {tab}
              </Box>
            );
          })}
        </Stack>

        <Stack spacing={1.5} sx={{ p: { xs: 2.25, sm: 3 } }}>
          <Typography sx={{ fontFamily: MONO, fontSize: { xs: '0.78rem', sm: '0.86rem' }, lineHeight: 1.7, overflowWrap: 'anywhere' }}>
            <Box component="span" sx={{ color: theme.palette.text.secondary, fontWeight: 500 }}>
              POST{'  '}
            </Box>
            {base && (
              <Box component="span" sx={{ color: theme.palette.primary.main }}>
                {base}
              </Box>
            )}
            <Box component="span" sx={{ color: theme.palette.text.primary, fontWeight: 500 }}>
              {step.route}
            </Box>
          </Typography>

          <Typography sx={{ fontFamily: MONO, fontSize: { xs: '0.78rem', sm: '0.86rem' }, lineHeight: 1.7 }}>
            <Box component="span" sx={{ color: theme.palette.text.secondary, fontWeight: 500 }}>
              model{'  '}
            </Box>
            <Box component="span" sx={{ color: theme.palette.primary.main, fontWeight: 600 }}>
              {displayModel}
            </Box>
          </Typography>

          <Typography
            sx={{
              fontFamily: MONO,
              fontSize: { xs: '0.78rem', sm: '0.86rem' },
              lineHeight: 1.8,
              color: theme.palette.text.primary,
              overflowWrap: 'anywhere',
              minHeight: '2.7em'
            }}
          >
            <Box component="span" sx={{ color: theme.palette.text.secondary }}>
              ↳{'  '}
            </Box>
            {reply.slice(0, typed)}
            {!reduce && (
              <Box
                component="span"
                aria-hidden
                sx={{
                  display: 'inline-block',
                  width: '0.55em',
                  height: '1.05em',
                  ml: '1px',
                  verticalAlign: 'text-bottom',
                  bgcolor: theme.palette.primary.main,
                  animation: 'donehubCaret 1s step-end infinite',
                  '@keyframes donehubCaret': { '0%, 49%': { opacity: 1 }, '50%, 100%': { opacity: 0 } }
                }}
              />
            )}
          </Typography>
        </Stack>
      </Box>

      <Typography sx={{ color: theme.palette.text.secondary, fontSize: '0.82rem' }}>
        {t('home.code.protocolSubtitle', { protocols: protocolList })}
      </Typography>
    </Stack>
  );
};

export default ApiTerminalDemo;
