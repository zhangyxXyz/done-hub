import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import { AppBar, Box, CssBaseline, Toolbar, Container, useMediaQuery } from '@mui/material';
import Header from './Header';
import Footer from 'ui-component/Footer';

// ==============================|| MINIMAL LAYOUT ||============================== //

const MinimalLayout = () => {
  const theme = useTheme();
  const [customContent, setCustomContent] = useState(false);
  const matchDownSm = useMediaQuery(theme.breakpoints.down('sm'));
  const headerHeight = matchDownSm ? '56px' : '64px';
  const footerHeight = '64px';

  useEffect(() => {
    const root = document.getElementById('root');
    const previous = {
      htmlHeight: document.documentElement.style.height,
      htmlOverflow: document.documentElement.style.overflow,
      bodyHeight: document.body.style.height,
      bodyOverflow: document.body.style.overflow,
      rootHeight: root?.style.height || '',
      rootOverflow: root?.style.overflow || ''
    };

    if (customContent) {
      document.documentElement.style.height = '100vh';
      document.documentElement.style.overflow = 'hidden';
      document.body.style.height = '100vh';
      document.body.style.overflow = 'hidden';
      if (root) {
        root.style.height = '100vh';
        root.style.overflow = 'hidden';
      }
    }

    return () => {
      document.documentElement.style.height = previous.htmlHeight;
      document.documentElement.style.overflow = previous.htmlOverflow;
      document.body.style.height = previous.bodyHeight;
      document.body.style.overflow = previous.bodyOverflow;
      if (root) {
        root.style.height = previous.rootHeight;
        root.style.overflow = previous.rootOverflow;
      }
    };
  }, [customContent]);

  return (
    <Box
      data-layout="minimal"
      data-custom-content={customContent ? 'true' : undefined}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        minHeight: '100vh',
        overflow: 'hidden',
        backgroundColor: customContent ? 'transparent' : theme.palette.background.default
      }}
    >
      <CssBaseline />
      <AppBar
        enableColorOnDark
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{
          bgcolor: customContent ? 'transparent' : theme.palette.background.default,
          boxShadow: 'none',
          borderBottom: 'none',
          zIndex: theme.zIndex.drawer + 1,
          width: '100%',
          borderRadius: 0,
          transition: theme.transitions.create('background-color', {
            duration: theme.transitions.duration.shortest
          })
        }}
      >
        <Container maxWidth="xl" sx={{ bgcolor: 'transparent' }}>
          <Toolbar sx={{ px: { xs: 1.5, sm: 2, md: 3 }, minHeight: '64px', height: '64px' }}>
            <Header />
          </Toolbar>
        </Container>
      </AppBar>
      <Box
        sx={{
          flex: 'none',
          overflow: customContent ? 'hidden' : 'auto',
          marginTop: 0,
          backgroundColor: customContent ? 'transparent' : theme.palette.background.default,
          // padding: { xs: '16px', sm: '20px', md: '24px' },
          position: 'fixed',
          top: customContent ? 0 : headerHeight,
          right: 0,
          bottom: customContent ? 0 : footerHeight,
          left: 0,
          height: 'auto',
          minHeight: 0,
          boxSizing: 'border-box',
          scrollbarWidth: 'thin',
          '&::-webkit-scrollbar': {
            width: '8px',
            height: '8px'
          },
          '&::-webkit-scrollbar-thumb': {
            background: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)',
            borderRadius: '4px'
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent'
          }
        }}
      >
        <Outlet context={{ customContent, setCustomContent, headerHeight, footerHeight }} />
      </Box>
      <Box
        sx={{
          flex: 'none',
          position: 'fixed',
          zIndex: 1,
          left: 0,
          right: 0,
          bottom: 0,
          height: footerHeight,
          background: 'var(--aihub-header)',
          borderTop: '1px solid var(--aihub-border)',
          backdropFilter: 'blur(18px) saturate(135%)',
          WebkitBackdropFilter: 'blur(18px) saturate(135%)',
          pointerEvents: 'auto'
        }}
      >
        <Footer />
      </Box>
    </Box>
  );
};

export default MinimalLayout;
