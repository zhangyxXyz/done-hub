// 可选主题主色预设，颜色取自 Minimals 调色板，与项目既有语义色同源
const themePresets = [
  { id: 'default', primaryLight: '#60A5FA', primaryMain: '#0B8DFF', primaryDark: '#0759B8', primary200: '#D8ECFF', primary800: '#082B64' },
  { id: 'blue', primaryLight: '#76B0F1', primaryMain: '#2065D1', primaryDark: '#103996', primary200: '#D1E9FC', primary800: '#061B64' },
  { id: 'cyan', primaryLight: '#68CDF9', primaryMain: '#078DEE', primaryDark: '#0351AB', primary200: '#CCF4FE', primary800: '#012972' },
  { id: 'purple', primaryLight: '#B985F4', primaryMain: '#7635DC', primaryDark: '#431A9E', primary200: '#EBD6FD', primary800: '#200A69' },
  { id: 'red', primaryLight: '#FFC1AC', primaryMain: '#FF3030', primaryDark: '#B71833', primary200: '#FFE3D5', primary800: '#7A0930' },
  { id: 'celadon', primaryLight: '#7BC8BE', primaryMain: '#2F9B8F', primaryDark: '#176D66', primary200: '#D8F1ED', primary800: '#073E3A' },
  { id: 'daiqing', primaryLight: '#6EA7AD', primaryMain: '#1F6F78', primaryDark: '#12464D', primary200: '#D6EAED', primary800: '#082A2F', primaryForeground: '#8FD0D7' },
  { id: 'rouge', primaryLight: '#E58B90', primaryMain: '#C04851', primaryDark: '#873039', primary200: '#F8D9DC', primary800: '#4A171F' },
  { id: 'cinnabar', primaryLight: '#F08A7D', primaryMain: '#D9483B', primaryDark: '#9C2B24', primary200: '#FBE0DC', primary800: '#571712' },
  { id: 'gamboge', primaryLight: '#F0C46B', primaryMain: '#D99A26', primaryDark: '#9B6A13', primary200: '#F8EBC7', primary800: '#563907' },
  { id: 'malachite', primaryLight: '#78C69A', primaryMain: '#2E8B57', primaryDark: '#1D633D', primary200: '#D9F0E3', primary800: '#0D3720' }
];

export const defaultPrimaryColor = themePresets[0].id;

// 根据预设 id 返回需要覆盖到 scss 主色的颜色集合，找不到时回退到默认预设
export function getPrimaryColors(id) {
  const preset = themePresets.find((item) => item.id === id) || themePresets[0];
  return {
    primaryLight: preset.primaryLight,
    primaryMain: preset.primaryMain,
    primaryDark: preset.primaryDark,
    primary200: preset.primary200,
    primary800: preset.primary800,
    primaryForeground: preset.primaryForeground || preset.primaryMain
  };
}

export default themePresets;
