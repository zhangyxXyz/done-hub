import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { Avatar, Box, Stack } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useReducedMotion } from 'framer-motion';
import OpenAI from '@lobehub/icons/es/OpenAI/components/Mono';
import Claude from '@lobehub/icons/es/Claude/components/Mono';
import Gemini from '@lobehub/icons/es/Gemini/components/Mono';
import DeepSeek from '@lobehub/icons/es/DeepSeek/components/Mono';
import Minimax from '@lobehub/icons/es/Minimax/components/Mono';
import Qwen from '@lobehub/icons/es/Qwen/components/Mono';
import Hunyuan from '@lobehub/icons/es/Hunyuan/components/Mono';
import XiaomiMiMo from '@lobehub/icons/es/XiaomiMiMo/components/Mono';
import Zhipu from '@lobehub/icons/es/Zhipu/components/Mono';
import { API } from 'utils/api';
import { FALLBACK_MODEL_STEPS, buildStepsFromModelInfo } from 'views/Home/components/homeModelInfo';

const MODEL_INFO_CACHE_KEY = 'donehub_home_model_info_steps_v11';
const MODEL_INFO_CACHE_TTL = 10 * 60 * 1000;
const MONO = '"JetBrains Mono", "SFMono-Regular", Consolas, monospace';

const MODEL_PROVIDERS = [
  { name: 'OpenAI', test: /gpt|openai|codex|(^|[\/\s])o\d/i, Brand: OpenAI },
  { name: 'Anthropic Claude', test: /claude|anthropic/i, Brand: Claude },
  { name: 'Google Gemini', test: /gemini|google/i, Brand: Gemini },
  { name: 'DeepSeek', test: /deepseek/i, Brand: DeepSeek },
  { name: 'MiniMax', test: /minimax|abab/i, Brand: Minimax },
  { name: 'Qwen', test: /qwen/i, Brand: Qwen },
  { name: '腾讯混元', test: /hy3|hunyuan|tencent/i, Brand: Hunyuan },
  { name: 'Xiaomi MiMo', test: /mimo|xiaomi/i, Brand: XiaomiMiMo },
  { name: '智谱 ChatGLM', test: /glm|z\.ai|zhipu/i, Brand: Zhipu }
];

const getModelProvider = (step) => MODEL_PROVIDERS.find(({ test }) => test.test(`${step.displayModel} ${step.model}`));

const readCachedSteps = () => {
  try {
    const cached = JSON.parse(window.localStorage.getItem(MODEL_INFO_CACHE_KEY) || 'null');
    if (cached?.steps && Date.now() - cached.timestamp < MODEL_INFO_CACHE_TTL) {
      return cached.steps;
    }
  } catch (error) {
    window.localStorage.removeItem(MODEL_INFO_CACHE_KEY);
  }

  return null;
};

const writeCachedSteps = (steps) => {
  try {
    window.localStorage.setItem(MODEL_INFO_CACHE_KEY, JSON.stringify({ steps, timestamp: Date.now() }));
  } catch (error) {
    window.localStorage.removeItem(MODEL_INFO_CACHE_KEY);
  }
};

const Pill = ({ name, Brand }) => {
  const theme = useTheme();

  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      sx={{
        flexShrink: 0,
        px: 2,
        py: 1.1,
        borderRadius: '12px',
        border: `1px solid ${theme.palette.divider}`,
        bgcolor: theme.palette.background.paper,
        color: theme.palette.text.primary,
        fontFamily: MONO,
        fontSize: '0.82rem',
        fontWeight: 500,
        whiteSpace: 'nowrap'
      }}
    >
      {Brand ? (
        <Brand size={17} />
      ) : (
        <Avatar
          sx={{
            width: 18,
            height: 18,
            bgcolor: 'transparent',
            color: 'inherit',
            border: `1px solid ${theme.palette.divider}`,
            fontSize: '0.58rem',
            fontFamily: MONO,
            fontWeight: 700
          }}
        >
          {name.slice(0, 1)}
        </Avatar>
      )}
      <span>{name}</span>
    </Stack>
  );
};

Pill.propTypes = { name: PropTypes.string, Brand: PropTypes.elementType };

const Row = ({ items, reverse }) => (
  <Box sx={{ display: 'flex', width: 'max-content' }}>
    {[0, 1].map((copy) => (
      <Box
        key={copy}
        aria-hidden={copy === 1}
        className="aihub-custom-provider-track"
        sx={{
          display: 'flex',
          gap: 1.5,
          pr: 1.5,
          animation: `${reverse ? 'aihubCustomMarqueeReverse' : 'aihubCustomMarquee'} 48s linear infinite`,
          '@keyframes aihubCustomMarquee': { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-100%)' } },
          '@keyframes aihubCustomMarqueeReverse': { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(0)' } }
        }}
      >
        {items.map(({ name, Brand, model }) => (
          <Pill key={`${model}-${name}`} name={name} Brand={Brand} />
        ))}
      </Box>
    ))}
  </Box>
);

Row.propTypes = { items: PropTypes.array, reverse: PropTypes.bool };

const useProviderPills = () => {
  const [steps, setSteps] = useState(() => {
    if (typeof window === 'undefined') return FALLBACK_MODEL_STEPS;
    return readCachedSteps() || FALLBACK_MODEL_STEPS;
  });

  useEffect(() => {
    let cancelled = false;
    const cached = readCachedSteps();
    if (cached) {
      setSteps(cached);
      return undefined;
    }

    API.get('/api/model_info/')
      .then((res) => {
        const { success, data } = res.data || {};
        const nextSteps = success ? buildStepsFromModelInfo(data) : FALLBACK_MODEL_STEPS;
        writeCachedSteps(nextSteps);
        if (!cancelled) setSteps(nextSteps);
      })
      .catch(() => {
        if (!cancelled) setSteps(FALLBACK_MODEL_STEPS);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return steps.reduce(
    (acc, step) => {
      const provider = getModelProvider(step);
      const name = provider?.name || step.displayModel || step.model;
      const key = name.toLowerCase();
      if (!name || acc.seen.has(key)) return acc;

      acc.seen.add(key);
      acc.items.push({
        name,
        model: step.model,
        Brand: provider?.Brand
      });
      return acc;
    },
    { seen: new Set(), items: [] }
  ).items;
};

const CustomHomeProviderMarquee = () => {
  const theme = useTheme();
  const reduce = useReducedMotion();
  const items = useProviderPills();

  if (reduce) {
    return (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
        {items.map(({ name, Brand, model }) => (
          <Pill key={`${model}-${name}`} name={name} Brand={Brand} />
        ))}
      </Box>
    );
  }

  const fade = `linear-gradient(to right, transparent, ${theme.palette.common.black} 7%, ${theme.palette.common.black} 93%, transparent)`;
  const second = [...items].reverse();

  return (
    <Box
      sx={{
        display: 'grid',
        gap: 1.5,
        maskImage: fade,
        WebkitMaskImage: fade,
        '&:hover .aihub-custom-provider-track': { animationPlayState: 'paused' }
      }}
    >
      <Row items={items} />
      <Row items={second} reverse />
    </Box>
  );
};

export default CustomHomeProviderMarquee;
