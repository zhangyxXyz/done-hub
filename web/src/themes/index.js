import { createTheme } from '@mui/material/styles';

// assets
import colors from 'assets/scss/_themes-vars.module.scss';

// project imports
import componentStyleOverrides from './compStyleOverride';
import themePalette from './palette';
import themeTypography from './typography';
import { varAlpha, createGradient } from './utils';

// 创建自定义渐变背景色
const customGradients = {
  primary: createGradient(colors.primaryMain, colors.primaryDark),
  secondary: createGradient(colors.secondaryMain, colors.secondaryDark)
};

/**
 * Represent theme style and structure as per Material-UI
 * @param {JsonObject} customization customization parameter object
 */

export const theme = (customization) => {
  const color = colors;
  const options = customization.theme === 'light' ? GetLightOption() : GetDarkOption();
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

function GetDarkOption() {
  const color = colors;
  return {
    mode: 'dark',
    heading: color.darkTextTitle,
    paper: '#1A1D23',
    backgroundDefault: '#13151A',
    background: '#1E2128',
    darkTextPrimary: '#E0E4EC',
    darkTextSecondary: '#A9B2C3',
    textDark: '#F8F9FC',
    menuSelected: color.primary200,
    menuSelectedBack: varAlpha(color.primaryMain, 0.12),
    divider: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    menuButton: '#292D36',
    menuButtonColor: color.primaryMain,
    menuChip: '#28323D',
    headBackgroundColor: '#28323D',
    headBackgroundColorHover: varAlpha('#28323D', 0.08),
    tableRowHoverBackgroundColor: 'rgba(0, 0, 0, 0.3)',
    tableBorderBottom: varAlpha(color.grey500, 0.2)
  };
}

function GetLightOption() {
  const color = colors;
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
