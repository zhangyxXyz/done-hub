import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';

import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline, StyledEngineProvider } from '@mui/material';
import { SET_THEME } from 'store/actions';
import { I18nextProvider } from 'react-i18next';
// routing
import Routes from 'routes';

// defaultTheme
import themes from 'themes';

// project imports
import NavigationScroll from 'layout/NavigationScroll';

// auth
import UserProvider from 'contexts/UserContext';
import StatusProvider from 'contexts/StatusContext';
import { NoticeProvider, NoticeDialogs } from 'ui-component/notice';
import { SnackbarProvider } from 'notistack';
import CopySnackbar from 'ui-component/Snackbar';

// locales
import i18n from 'i18n/i18n';

// ==============================|| APP ||============================== //

const App = () => {
  const dispatch = useDispatch();
  const customization = useSelector((state) => state.customization);
  const siteInfo = useSelector((state) => state.siteInfo);

  useEffect(() => {
    const syncResolvedTheme = () => {
      const storedTheme = localStorage.getItem('theme');
      const resolvedTheme =
        storedTheme === 'dark' || storedTheme === 'light'
          ? storedTheme
          : window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';

      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.dataset.themeMode = storedTheme || 'auto';
      document.documentElement.style.colorScheme = resolvedTheme;
      localStorage.setItem('resolved_theme', resolvedTheme);
    };

    syncResolvedTheme();

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', syncResolvedTheme);

    return () => {
      mediaQuery.removeEventListener('change', syncResolvedTheme);
    };
  }, [customization.theme]);

  useEffect(() => {
    const styleId = 'custom-css';
    let style = document.getElementById(styleId);

    if (!siteInfo.custom_css) {
      style?.remove();
      localStorage.removeItem('custom_css');
      return;
    }

    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }

    style.textContent = siteInfo.custom_css;
    localStorage.setItem('custom_css', siteInfo.custom_css);
  }, [siteInfo.custom_css]);

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme');
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    if (storedTheme) {
      dispatch({ type: SET_THEME, theme: storedTheme });
    } else {
      const systemTheme = mediaQuery.matches ? 'dark' : 'light';
      dispatch({ type: SET_THEME, theme: systemTheme });
    }
    const handleThemeChange = (e) => {
      const storedTheme = localStorage.getItem('theme');
      if (!storedTheme) {
        const systemTheme = e.matches ? 'dark' : 'light';
        dispatch({ type: SET_THEME, theme: systemTheme });
      }
    };

    mediaQuery.addEventListener('change', handleThemeChange);

    return () => {
      mediaQuery.removeEventListener('change', handleThemeChange);
    };
  }, [dispatch]);

  return (
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={themes(customization)}>
        <CssBaseline />
        <NavigationScroll>
          <SnackbarProvider
            autoHideDuration={5000}
            maxSnack={3}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            Components={{ copy: CopySnackbar }}
          >
            <StatusProvider>
              <I18nextProvider i18n={i18n}>
                <NoticeProvider>
                  <UserProvider>
                    <Routes />
                    <NoticeDialogs />
                  </UserProvider>
                </NoticeProvider>
              </I18nextProvider>
            </StatusProvider>
          </SnackbarProvider>
        </NavigationScroll>
      </ThemeProvider>
    </StyledEngineProvider>
  );
};

export default App;
