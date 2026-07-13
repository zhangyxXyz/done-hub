import { useTranslation as useOriginalTranslation } from 'react-i18next';

// 自定义 useTranslation 钩子
function useCustomizeT() {
  const { t: originalT, i18n, ...rest } = useOriginalTranslation();

  // 修改后的 t 函数
  const t = (key, options) => {
    // 先兼容以完整中文句子作为扁平 key 的历史翻译；未命中时再按标准
    // i18next 路径解析，支持 channel_edit.xxx 这类嵌套翻译键。
    const literal = originalT(key, { ...options, nsSeparator: false, keySeparator: false });
    if (literal !== key) return literal;
    // 只有确实存在嵌套键时才启用标准解析，避免普通帮助文本中的
    // https: 被误判成 namespace 并截断成 //example.com。
    return i18n.exists(key, options) ? originalT(key, options) : key;
  };

  return { t, i18n, ...rest };
}

export default useCustomizeT;
