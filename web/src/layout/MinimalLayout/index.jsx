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
  const matchDownMd = useMediaQuery(theme.breakpoints.down('md'));
  const headerHeight = matchDownSm ? '56px' : '64px';
  const footerHeight = matchDownMd ? '80px' : '60px';

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
        height: customContent ? '100vh' : 'auto',
        minHeight: '100vh',
        overflow: customContent ? 'hidden' : 'visible',
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
          flex: '1 1 auto',
          overflow: customContent ? 'hidden' : 'auto',
          marginTop: customContent ? 0 : { xs: '56px', sm: '64px' },
          backgroundColor: customContent ? 'transparent' : theme.palette.background.default,
          // padding: { xs: '16px', sm: '20px', md: '24px' },
          position: 'relative',
          height: customContent ? '100vh' : 'auto',
          minHeight: customContent ? '100vh' : `calc(100vh - ${headerHeight} - ${footerHeight})`,
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
          position: customContent ? 'fixed' : 'relative',
          zIndex: 1,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: customContent ? 'transparent' : theme.palette.background.default,
          pointerEvents: 'auto'
        }}
      >
        <Footer />
      </Box>
    </Box>
  );
};

export default MinimalLayout;
