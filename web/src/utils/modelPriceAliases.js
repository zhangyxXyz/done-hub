const hasModelProviderPrefix = (modelName, prefix) =>
  modelName === prefix ||
  modelName.startsWith(`${prefix}-`) ||
  modelName.startsWith(`${prefix}_`) ||
  modelName.startsWith(`${prefix}.`) ||
  (prefix.length >= 3 && modelName.startsWith(prefix));

const normalizeModelName = (modelName) => String(modelName || '').trim().toLowerCase().replace(/^[+~]+/, '');

const addAliasVariants = (aliases, alias) => {
  aliases.add(alias);
  aliases.add(`${alias}:exacto`);
  aliases.add(`${alias}:thinking`);
  aliases.add(`${alias}:free`);
};

const addProviderAliasVariants = (aliases, providers, candidate) => {
  providers.forEach((provider) => addAliasVariants(aliases, `${provider}/${candidate}`));
};

const isNumericModelVersionPart = (part) => part !== '' && [...part].every((char) => char >= '0' && char <= '9');

const normalizeClaudeOpenRouterModel = (modelName) => {
  const parts = modelName.split('-');
  if (parts.length < 2) {
    return modelName;
  }

  let start = parts.length - 1;
  while (start >= 0 && isNumericModelVersionPart(parts[start])) {
    start -= 1;
  }
  if (start === parts.length - 1) {
    return modelName;
  }

  return `${parts.slice(0, start + 1).join('-')}-${parts.slice(start + 1).join('.')}`;
};

const getModelNameCandidates = (modelName) => {
  const normalized = normalizeModelName(modelName);
  if (!normalized) {
    return [];
  }

  const candidates = [normalized];
  const slashIndex = normalized.lastIndexOf('/');
  if (slashIndex >= 0 && slashIndex < normalized.length - 1) {
    candidates.push(normalized.slice(0, slashIndex), normalized.slice(slashIndex + 1));
  }

  return candidates;
};

const modelProviderRules = [
  { prefixes: ['anthropic', 'claude'], provider: 'Anthropic' },
  { prefixes: ['moonshot', 'moonshotai', 'kimi'], provider: 'Moonshot' },
  { prefixes: ['minimax', 'abab'], provider: 'MiniMax' },
  { prefixes: ['mimo', 'xiaomi'], provider: 'Xiaomi' },
  { prefixes: ['qwen', 'qwq', 'qvq', 'tongyi', 'dashscope', 'alibaba'], provider: 'Qwen' },
  { prefixes: ['glm', 'z-ai', 'zhipu'], provider: 'Zhipu' },
  { prefixes: ['deepseek'], provider: 'Deepseek' },
  { prefixes: ['ernie', 'cobuddy', 'qianfan', 'wenxin', 'baidu'], provider: 'Baidu' },
  { prefixes: ['hunyuan'], provider: 'Hunyuan' },
  { prefixes: ['hy3', 'tencent'], provider: 'Tencent' },
  { prefixes: ['doubao', 'seed', 'ui-tars', 'volcengine', 'bytedance-seed', 'bytedance'], provider: 'Doubao' },
  { prefixes: ['baichuan'], provider: 'Baichuan' },
  { prefixes: ['yi', 'lingyi', '01-ai'], provider: 'Yi' },
  { prefixes: ['sparkdesk', 'xunfei', 'iflytek'], provider: 'Spark' },
  { prefixes: ['360gpt', 'ai360', '360'], provider: '360' },
  { prefixes: ['openrouter'], provider: 'OpenRouter' }
];

export const inferModelProviderName = (modelName) => {
  const candidates = getModelNameCandidates(modelName);
  if (candidates.length === 0) {
    return null;
  }

  const orderedCandidates = [...candidates];
  const normalized = candidates[0];
  const slashIndex = normalized.lastIndexOf('/');
  if (slashIndex >= 0 && slashIndex < normalized.length - 1) {
    orderedCandidates.splice(1, 2, normalized.slice(slashIndex + 1), normalized.slice(0, slashIndex));
  }

  for (const candidate of orderedCandidates) {
    if (!candidate || candidate.includes('/')) {
      continue;
    }
    const rule = modelProviderRules.find(({ prefixes }) => prefixes.some((prefix) => hasModelProviderPrefix(candidate, prefix)));
    if (rule) {
      return rule.provider;
    }
  }

  return null;
};

export const getModelPriceAliases = (modelName) => {
  const aliases = new Set(getModelNameCandidates(modelName));

  getModelNameCandidates(modelName).forEach((candidate) => {
    if (!candidate || candidate.includes('/')) {
      return;
    }

    if (hasModelProviderPrefix(candidate, 'kimi')) {
      addAliasVariants(aliases, `moonshotai/${candidate}`);
      aliases.add(`~moonshotai/${candidate}`);
    } else if (hasModelProviderPrefix(candidate, 'claude')) {
      addAliasVariants(aliases, `anthropic/${candidate}`);
      addAliasVariants(aliases, `anthropic/${normalizeClaudeOpenRouterModel(candidate)}`);
      aliases.add(`~anthropic/${candidate}`);
    } else if (
      hasModelProviderPrefix(candidate, 'qwen') ||
      hasModelProviderPrefix(candidate, 'qwq') ||
      hasModelProviderPrefix(candidate, 'qvq') ||
      hasModelProviderPrefix(candidate, 'tongyi') ||
      hasModelProviderPrefix(candidate, 'dashscope')
    ) {
      addProviderAliasVariants(aliases, ['qwen', 'alibaba'], candidate);
    } else if (
      hasModelProviderPrefix(candidate, 'glm') ||
      hasModelProviderPrefix(candidate, 'z-ai') ||
      hasModelProviderPrefix(candidate, 'zhipu')
    ) {
      addAliasVariants(aliases, `z-ai/${candidate}`);
      aliases.add(`zai.${candidate}`);
    } else if (hasModelProviderPrefix(candidate, 'deepseek')) {
      addProviderAliasVariants(aliases, ['deepseek'], candidate);
    } else if (hasModelProviderPrefix(candidate, 'mimo')) {
      addProviderAliasVariants(aliases, ['xiaomi'], candidate);
    } else if (hasModelProviderPrefix(candidate, 'hy3') || hasModelProviderPrefix(candidate, 'hunyuan')) {
      addAliasVariants(aliases, `tencent/${candidate}`);
    } else if (hasModelProviderPrefix(candidate, 'minimax') || hasModelProviderPrefix(candidate, 'abab')) {
      addProviderAliasVariants(aliases, ['minimax'], candidate);
    } else if (
      hasModelProviderPrefix(candidate, 'ernie') ||
      hasModelProviderPrefix(candidate, 'cobuddy') ||
      hasModelProviderPrefix(candidate, 'qianfan') ||
      hasModelProviderPrefix(candidate, 'wenxin')
    ) {
      addProviderAliasVariants(aliases, ['baidu'], candidate);
    } else if (
      hasModelProviderPrefix(candidate, 'doubao') ||
      hasModelProviderPrefix(candidate, 'seed') ||
      hasModelProviderPrefix(candidate, 'ui-tars') ||
      hasModelProviderPrefix(candidate, 'volcengine')
    ) {
      addProviderAliasVariants(aliases, ['bytedance-seed', 'bytedance'], candidate);
    } else if (hasModelProviderPrefix(candidate, 'baichuan')) {
      addProviderAliasVariants(aliases, ['baichuan'], candidate);
    } else if (hasModelProviderPrefix(candidate, 'yi') || hasModelProviderPrefix(candidate, 'lingyi')) {
      addProviderAliasVariants(aliases, ['01-ai', 'lingyi'], candidate);
    } else if (hasModelProviderPrefix(candidate, 'sparkdesk') || hasModelProviderPrefix(candidate, 'xunfei')) {
      addProviderAliasVariants(aliases, ['xunfei', 'iflytek'], candidate);
    } else if (hasModelProviderPrefix(candidate, '360gpt') || hasModelProviderPrefix(candidate, 'ai360')) {
      addProviderAliasVariants(aliases, ['ai360', '360'], candidate);
    }
  });

  return aliases;
};

export const createPriceModelMatcher = (prices) => {
  const findPriceModel = createPriceModelFinder(prices);

  return (modelName) => {
    return Boolean(findPriceModel(modelName));
  };
};

export const createPriceModelFinder = (prices = []) => {
  const exactModels = new Map();
  const wildcardPrices = [];

  prices.forEach((price) => {
    const model = normalizeModelName(price?.model);
    if (!model) {
      return;
    }

    if (model.endsWith('*') && model.length > 1) {
      wildcardPrices.push({ prefix: model.slice(0, -1), price });
    } else {
      exactModels.set(model, price);
    }
  });

  return (modelName) => {
    const aliases = Array.from(getModelPriceAliases(modelName));
    for (const alias of aliases) {
      const price = exactModels.get(alias);
      if (price) {
        return price;
      }
    }

    const wildcard = wildcardPrices.find(({ prefix }) => aliases.some((alias) => alias.startsWith(prefix)));
    return wildcard?.price || null;
  };
};
