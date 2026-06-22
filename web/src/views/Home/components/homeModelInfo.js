export const FALLBACK_MODEL_STEPS = [
  { proto: 'OpenAI', model: 'openai/gpt-5.5', displayModel: 'GPT 5.5', route: '/v1/chat/completions' },
  { proto: 'OpenAI', model: 'openai/gpt-5.3-codex', displayModel: 'GPT 5.3 Codex', route: '/v1/chat/completions' },
  { proto: 'OpenAI', model: 'openai/o4-mini', displayModel: 'o4 Mini', route: '/v1/chat/completions' },
  { proto: 'OpenAI', model: 'deepseek/deepseek-v4-pro', displayModel: 'DeepSeek V4 Pro', route: '/v1/chat/completions' },
  { proto: 'OpenAI', model: 'deepseek/deepseek-v4-flash', displayModel: 'DeepSeek V4 Flash', route: '/v1/chat/completions' },
  { proto: 'OpenAI', model: 'z-ai/glm-5.2', displayModel: 'GLM 5.2', route: '/v1/chat/completions' },
  { proto: 'OpenAI', model: 'z-ai/glm-5.1', displayModel: 'GLM 5.1', route: '/v1/chat/completions' },
  { proto: 'OpenAI', model: 'xiaomi/mimo-v2.5-pro', displayModel: 'MiMo V2.5 Pro', route: '/v1/chat/completions' },
  { proto: 'OpenAI', model: 'xiaomi/mimo-v2.5', displayModel: 'MiMo V2.5', route: '/v1/chat/completions' },
  { proto: 'OpenAI', model: 'qwen/qwen3.7-plus', displayModel: 'Qwen3.7 Plus', route: '/v1/chat/completions' },
  { proto: 'OpenAI', model: 'qwen/qwen3.7-max', displayModel: 'Qwen3.7 Max', route: '/v1/chat/completions' },
  { proto: 'OpenAI', model: 'tencent/hy3-preview', displayModel: 'Hy3 Preview', route: '/v1/chat/completions' },
  { proto: 'Claude', model: 'anthropic/claude-sonnet-4.6', displayModel: 'Claude Sonnet 4.6', route: '/claude/v1/messages' },
  { proto: 'Claude', model: 'anthropic/claude-sonnet-4.5', displayModel: 'Claude Sonnet 4.5', route: '/claude/v1/messages' },
  { proto: 'Claude', model: 'minimax/minimax-m3', displayModel: 'MiniMax M3', route: '/claude/v1/messages' },
  { proto: 'Gemini', model: 'google/gemini-3.5-flash', displayModel: 'Gemini 3.5 Flash', route: '/gemini/v1beta/models' }
];

export const MODEL_TABS = ['OpenAI', 'Claude', 'Gemini'];

const MIN_MAIN_GPT_MAJOR = 5;

const normalizeModelId = (model) => String(model || '').trim();
const getSearchText = (item) => `${normalizeModelId(item?.model)} ${normalizeModelId(item?.name)}`;
const hasLatestAlias = (item) => /^~/.test(normalizeModelId(item?.model)) || /\blatest\b/i.test(getSearchText(item));
const hasParameterScale = (item) => /\b\d+(?:\.\d+)?\s*[bmk]\b/i.test(getSearchText(item));
const hasFastVariant = (item) => /(?:^|[-_\s(])fast(?:[-_\s)]|$)/i.test(getSearchText(item));
const baseExclude = (item) =>
  /oss|audio|image|embedding|transcribe|tts|free|safeguard|instruct|custom\s*tools|customtools/i.test(getSearchText(item)) ||
  hasLatestAlias(item) ||
  hasParameterScale(item);
const openAIBaseExclude = (item) =>
  baseExclude(item) || /deep[-\s]?research|high|pro|mini|nano|turbo|chat|older/i.test(getSearchText(item));

const getGptMajor = (text) => {
  const match = text.match(/(^|[/:~\s])gpt[-\s]?(\d+)(?:[.\-\s]\d+)?(?:\b|$)/i);
  return match ? Number(match[2]) : 0;
};

const isGptMainModel = (text) => getGptMajor(text) >= MIN_MAIN_GPT_MAJOR;

export const cleanDisplayName = (value) =>
  normalizeModelId(value)
    .replace(/^[^:]+:\s*/, '')
    .replace(/[-\s]\d{4}-\d{2}-\d{2}$/i, '')
    .replace(/[-\s]\d{4}-\d{2}$/i, '')
    .replace(/[-\s]\d{2}-\d{4}$/i, '')
    .replace(/\s+\d{4}\s+\d{2}$/i, '')
    .replace(/\s+\d{2}\s+\d{4}$/i, '')
    .replace(/[-\s]\d{4}$/i, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .replace(/\s*\[[^\]]*\]\s*$/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b[a-z][a-z0-9.]*/gi, (word) => {
      if (/^[A-Z0-9.]+$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    });

export const getDisplayModel = (item) => {
  const rawName = normalizeModelId(item?.name);
  const rawModel = normalizeModelId(item?.model);
  const source = rawName || rawModel.replace(/^~/, '').split('/').pop();
  return cleanDisplayName(source);
};

const versionTuple = (item) => {
  const match = getSearchText(item).match(
    /(?:v|gpt[-\s]?|glm[-\s]?|qwen|claude[-\s]?(?:sonnet|opus|haiku)?[-\s]?|gemini[-\s]?|minimax[-\s]?m?|\/o)(\d+(?:[.-]\d+)*)/i
  );
  return match ? match[1].split(/[.-]/).map((part) => Number(part) || 0) : [];
};

const compareTuples = (left, right) => {
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

const compareByNewest = (a, b) => {
  const versionDiff = compareTuples(versionTuple(a), versionTuple(b));
  if (versionDiff !== 0) return versionDiff;
  if (hasFastVariant(a) !== hasFastVariant(b)) return hasFastVariant(a) ? -1 : 1;
  return (Number(a?.id) || 0) - (Number(b?.id) || 0);
};

const versionFamily = (item) => {
  const text = getSearchText(item).toLowerCase();
  const deepseek = text.match(/deepseek[-\s]?v(\d+)/i);
  if (deepseek) return `deepseek-v${deepseek[1]}`;
  const glm = text.match(/glm[-\s]?(\d+)/i);
  if (glm) return `glm-${glm[1]}`;
  const qwen = text.match(/qwen\s?(\d+(?:[.-]\d+)?)/i);
  if (qwen) return `qwen-${qwen[1].replace('-', '.')}`;
  const gpt = text.match(/gpt[-\s]?(\d+(?:[.-]\d+)?)/i);
  if (gpt) return `gpt-${gpt[1].replace('-', '.')}`;
  const openaiO = text.match(/(?:^|\/)o(\d+)/i);
  if (openaiO) return `o${openaiO[1]}`;
  return '';
};

const selectUnique = (items, limit) =>
  items
    .sort((a, b) => compareByNewest(b, a))
    .reduce((acc, item) => {
      const key = getDisplayModel(item).toLowerCase();
      if (!key || acc.seen.has(key)) return acc;
      acc.seen.add(key);
      acc.items.push(item);
      return acc;
    }, { seen: new Set(), items: [] }).items
    .slice(0, limit);

const selectLatestFamily = (items, limit) => {
  const sorted = [...items].sort((a, b) => compareByNewest(b, a));
  const family = versionFamily(sorted[0]);
  return selectUnique(family ? sorted.filter((item) => versionFamily(item) === family) : sorted, limit);
};

const BRAND_RULES = [
  {
    proto: 'OpenAI',
    route: '/v1/chat/completions',
    limit: 1,
    family: true,
    matcher: (text) => isGptMainModel(text),
    exclude: openAIBaseExclude
  },
  {
    proto: 'OpenAI',
    route: '/v1/chat/completions',
    limit: 2,
    matcher: (text) => /(^|[/:~\s])gpt[-\s].*codex|codex.*(^|[/:~\s])gpt[-\s]/i.test(text),
    exclude: (item) => baseExclude(item) || /mini|max/i.test(getSearchText(item))
  },
  {
    proto: 'OpenAI',
    route: '/v1/chat/completions',
    limit: 2,
    family: true,
    matcher: (text) => /(^|\/)o\d/i.test(text),
    exclude: (item) => baseExclude(item) || /deep[-\s]?research|high/i.test(getSearchText(item))
  },
  {
    proto: 'OpenAI',
    route: '/v1/chat/completions',
    limit: 2,
    family: true,
    matcher: (text) => /deepseek/i.test(text),
    exclude: baseExclude
  },
  {
    proto: 'OpenAI',
    route: '/v1/chat/completions',
    limit: 2,
    family: true,
    matcher: (text) => /(^|[/:~\s])glm[-\s]/i.test(text),
    exclude: baseExclude
  },
  {
    proto: 'OpenAI',
    route: '/v1/chat/completions',
    limit: 2,
    matcher: (text) => /(^|[/:~\s])mimo[-\s]/i.test(text),
    exclude: baseExclude
  },
  {
    proto: 'OpenAI',
    route: '/v1/chat/completions',
    limit: 2,
    family: true,
    matcher: (text) => /(^|[/:~\s])qwen/i.test(text),
    exclude: baseExclude
  },
  {
    proto: 'OpenAI',
    route: '/v1/chat/completions',
    limit: 1,
    matcher: (text) => /(^|[/:~\s])(hunyuan|hy3|tencent)\b/i.test(text),
    exclude: baseExclude
  },
  {
    proto: 'Claude',
    route: '/claude/v1/messages',
    limit: 5,
    matcher: (text) => /(\b|\/|~)claude[-\s]/i.test(text),
    exclude: (item) => baseExclude(item) || /fable/i.test(getSearchText(item))
  },
  {
    proto: 'Claude',
    route: '/claude/v1/messages',
    limit: 1,
    matcher: (text) => /minimax|abab/i.test(text),
    exclude: hasLatestAlias
  },
  {
    proto: 'Gemini',
    route: '/gemini/v1beta/models',
    limit: 5,
    matcher: (text) => /(^|[/:~\s])gemini[-\s]/i.test(text),
    exclude: baseExclude
  }
];

export const buildStepsFromModelInfo = (modelInfos) => {
  if (!Array.isArray(modelInfos)) return FALLBACK_MODEL_STEPS;

  const steps = BRAND_RULES.flatMap((rule) => {
    const matched = modelInfos.filter((item) => rule.matcher(getSearchText(item), item) && !rule.exclude(item));
    const selected = rule.family ? selectLatestFamily(matched, rule.limit) : selectUnique(matched, rule.limit);

    return selected.map((item) => ({
      proto: rule.proto,
      model: normalizeModelId(item.model),
      displayModel: getDisplayModel(item),
      route: rule.route
    }));
  });

  return steps.length ? steps : FALLBACK_MODEL_STEPS;
};
