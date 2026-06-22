import { createTheme } from '@mui/material/styles';

// assets
import colors from 'assets/scss/_themes-vars.module.scss';

// project imports
import componentStyleOverrides from './compStyleOverride';
import themePalette from './palette';
import themeTypography from './typography';
import { varAlpha, createGradient } from './utils';
import { getPrimaryColors } from './presets';

/**
 * Represent theme style and structure as per Material-UI
 * @param {JsonObject} customization customization parameter object
 */

export const theme = (customization) => {
  // 用用户选择的主题色覆盖默认主色
  const presetColor = getPrimaryColors(customization.primaryColor);
  const color = {
    ...colors,
    ...presetColor,
    ...(customization.theme === 'dark' && { primaryMain: presetColor.primaryForeground })
  };
  // 创建自定义渐变背景色
  const customGradients = {
    primary: createGradient(color.primaryMain, color.primaryDark),
    secondary: createGradient(color.secondaryMain, color.secondaryDark)
  };
  const options = customization.theme === 'light' ? GetLightOption(color) : GetDarkOption(color);
  const themeOption = {
    colors: color,
    gradients: customGradients,
    ...options,
    customization
  };

  const themeOptions = {
    direction: 'ltr',
    palette: themePalette(themeOption),
    mixins: {
      toolbar: {
        minHeight: '48px',
        padding: '8px 16px',
        '@media (min-width: 600px)': {
          minHeight: '48px'
        }
      }
    },
    shape: {
      borderRadius: themeOption?.customization?.borderRadius || 12
    },
    typography: themeTypography(themeOption),
    breakpoints: {
      values: {
        xs: 0,
        sm: 600,
        md: 960,
        lg: 1280,
        xl: 1920
      }
    },
    zIndex: {
      modal: 1300,
      snackbar: 1400,
      tooltip: 1500
    }
  };

  const themes = createTheme(themeOptions);
  // 把自定义 themeOption 字段挂到 MUI theme 上，sx callback (theme) => theme.xxx 才拿得到
  themes.headBackgroundColor = themeOption.headBackgroundColor;
  themes.tableRowHoverBackgroundColor = themeOption.tableRowHoverBackgroundColor;
  themes.components = componentStyleOverrides(themeOption);

  return themes;
};

export default theme;

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const fullHex =
    normalized.length === 3
      ? normalized
          .split('')
          .map((value) => value + value)
          .join('')
      : normalized;

  return {
    r: parseInt(fullHex.slice(0, 2), 16),
    g: parseInt(fullHex.slice(2, 4), 16),
    b: parseInt(fullHex.slice(4, 6), 16)
  };
}

function mixHex(baseHex, tintHex, tintWeight = 0.5) {
  const base = hexToRgb(baseHex);
  const tint = hexToRgb(tintHex);
  const weight = Math.min(Math.max(tintWeight, 0), 1);
  const mixChannel = (baseChannel, tintChannel) => Math.round(baseChannel * (1 - weight) + tintChannel * weight);
  const toHex = (value) => value.toString(16).padStart(2, '0');

  return `#${toHex(mixChannel(base.r, tint.r))}${toHex(mixChannel(base.g, tint.g))}${toHex(mixChannel(base.b, tint.b))}`;
}

function GetDarkOption(color) {
  const backgroundDefault = mixHex('#05080C', color.primary800, 0.34);
  const paper = mixHex('#101318', color.primary800, 0.3);
  const background = mixHex('#151922', color.primaryDark, 0.24);
  const chrome = mixHex('#202733', color.primaryDark, 0.2);

  return {
    mode: 'dark',
    heading: color.darkTextTitle,
    paper,
    backgroundDefault,
    background,
    darkTextPrimary: '#E0E4EC',
    darkTextSecondary: '#A9B2C3',
    textDark: '#F8F9FC',
    menuSelected: color.primary200,
    menuSelectedBack: varAlpha(color.primaryMain, 0.12),
    divider: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    menuButton: chrome,
    menuButtonColor: color.primaryMain,
    menuChip: chrome,
    headBackgroundColor: chrome,
    headBackgroundColorHover: varAlpha(chrome, 0.08),
    tableRowHoverBackgroundColor: 'rgba(0, 0, 0, 0.3)',
    tableBorderBottom: varAlpha(color.grey500, 0.2)
  };
}

function GetLightOption(color) {
  return {
    mode: 'light',
    heading: '#202939',
    paper: '#FFFFFF',
    backgroundDefault: '#F5F7FA',
    background: '#F5F7FA',
    darkTextPrimary: '#3E4555',
    darkTextSecondary: '#6C7A92',
    textDark: '#252F40',
    menuSelected: color.primaryMain,
    menuSelectedBack: varAlpha(color.primary200, 0.08),
    divider: '#E9EDF5',
    borderColor: '#E0E6ED',
    menuButton: varAlpha(color.primary200, 0.12),
    menuButtonColor: color.primaryMain,
    menuChip: color.grey200,
    headBackgroundColor: color.grey200,
    headBackgroundColorHover: varAlpha(color.grey200, 0.12),
    tableRowHoverBackgroundColor: 'rgba(0, 0, 0, 0.04)',
    tableBorderBottom: color.grey300
  };
}
