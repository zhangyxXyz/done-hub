import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPriceModelMatcher, createPriceModelFinder, inferModelProviderName } from '../src/utils/modelPriceAliases.js';

test('HY versions match configured prices without matching unrelated names', () => {
  const hasPrice = createPriceModelMatcher([
    { model: 'tencent/hy3-preview:free' },
    { model: 'tencent/hy4-preview' },
    { model: 'tencent/hy10-preview' }
  ]);
  for (const name of ['hy3-preview', 'hy4-preview', 'hy10-preview']) {
    assert.equal(hasPrice(name), true);
    assert.equal(inferModelProviderName(name), 'Tencent');
  }
  for (const name of ['hyper-model', 'hybrid-model', 'seedling', 'kimiko']) {
    assert.equal(inferModelProviderName(name), null);
  }
  assert.equal(inferModelProviderName('yi1.5'), 'Yi');
  assert.equal(inferModelProviderName('google/gemini-3.5-flash'), 'Google Gemini');
});

test('Grok aliases preserve exact platform prices', () => {
  const canonical = { model: 'x-ai/grok-4.6', input: 2 };
  const platform = { model: 'us.xai.grok-4.6', input: 2.2 };
  const findPrice = createPriceModelFinder([canonical, platform]);
  assert.equal(findPrice('grok-4.6'), canonical);
  assert.equal(findPrice(platform.model), platform);
  assert.equal(inferModelProviderName(platform.model), 'xAI');
});

test('DeepSeek Flash explicitly falls back to latest while exact prices take priority', () => {
  const latest = { model: '~deepseek/deepseek-flash-latest', input: 0.15 };
  const exact = { model: 'deepseek-flash', input: 0.2 };
  const hasPrice = createPriceModelMatcher([latest], true);
  assert.equal(hasPrice('~deepseek/deepseek-flash-latest'), true);
  assert.equal(hasPrice('deepseek-flash'), true);
  assert.equal(createPriceModelFinder([latest], true)('deepseek-flash'), latest);
  assert.equal(createPriceModelFinder([latest, exact], true)('deepseek-flash'), exact);
  assert.equal(hasPrice('deepseek-v4-flash'), false);
  assert.equal(hasPrice('deepseek-flash-preview'), false);
  assert.equal(createPriceModelMatcher([{ model: 'other-model-latest' }])('other-model'), false);
});

test('latest fallback applies to arbitrary models, after wildcards, without crossing platforms', () => {
  const latest = { model: 'arbitrary-model-latest' };
  assert.equal(createPriceModelFinder([latest], true)('arbitrary-model'), latest);
  assert.equal(createPriceModelFinder([latest], false)('arbitrary-model'), null);
  const wildcard = { model: 'arbitrary-*' };
  assert.equal(createPriceModelFinder([latest, wildcard], true)('arbitrary-model'), wildcard);
  assert.equal(createPriceModelFinder([{ model: 'arbitrary-model' }], true)('arbitrary-model-latest'), null);
  assert.equal(createPriceModelFinder([{ model: 'claude-test-latest' }], true)('vendor/claude-test'), null);
  const platform = { model: 'vendor/claude-test-latest' };
  assert.equal(createPriceModelFinder([platform], true)('vendor/claude-test'), platform);
});
