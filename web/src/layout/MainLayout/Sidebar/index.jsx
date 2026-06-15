import PropTypes from 'prop-types';
import { useCallback, useEffect, useMemo, useState } from 'react';

// material-ui
import { useTheme } from '@mui/material/styles';
import { Box, Drawer, IconButton, SvgIcon, Tooltip, useMediaQuery } from '@mui/material';

// project imports
import MenuList from './MenuList';
import LogoSection from '../LogoSection';
import MenuCard from './MenuCard';
import { drawerWidth, miniDrawerWidth } from 'store/constant';
import { useTranslation } from 'react-i18next';
import { varAlpha } from 'themes/utils';
import { API } from 'utils/api';

const transitionEasing = 'cubic-bezier(0.4, 0, 0.2, 1)';
const transitionDuration = '200ms';

// ==============================|| SIDEBAR DRAWER ||============================== //

const Sidebar = ({ drawerOpen, drawerToggle, window: windowProp }) => {
  const theme = useTheme();
  const matchUpMd = useMediaQuery(theme.breakpoints.up('md'));
  const { t } = useTranslation();
  const isDark = theme.palette.mode === 'dark';
  const isMini = matchUpMd && !drawerOpen;
  const currentWidth = isMini ? miniDrawerWidth : drawerWidth;
  const appVersion = import.meta.env.VITE_APP_VERSION || t('menu.unknownVersion');
  const [playgroundServices, setPlaygroundServices] = useState([]);

  const defaultServices = useMemo(
    () => [
      { key: 'nextchat', name: 'NextChat', version: 'v2.16.1', ok: false },
      { key: 'mjchat', name: 'MJChat', version: 'v2.26.5', ok: false }
    ],
    []
  );

  const fetchPlaygroundStatus = useCallback(async () => {
    try {
      const res = await API.get('/api/user/playground/status');
      if (res?.data?.success && Array.isArray(res.data.data?.services)) {
        setPlaygroundServices(res.data.data.services);
        return;
      }
    } catch (error) {
      // Keep the footer quiet; red indicators are enough for this tiny health check.
    }
    setPlaygroundServices(defaultServices);
  }, [defaultServices]);

  useEffect(() => {
    if (isMini) {
      return undefined;
    }

    fetchPlaygroundStatus();
    const timer = window.setInterval(fetchPlaygroundStatus, 30000);
    return () => window.clearInterval(timer);
  }, [fetchPlaygroundStatus, isMini]);

  const serviceStatus = playgroundServices.length > 0 ? playgroundServices : defaultServices;
  const footerStatuses = useMemo(
    () => [
      { key: 'donehub', name: 'Done Hub', label: 'Hub', version: appVersion, ok: true },
      ...serviceStatus.map((service) => ({
        ...service,
        label: service.key === 'mjchat' ? 'MJ' : 'Next'
      }))
    ],
    [appVersion, serviceStatus]
  );

  const scrollbarStyles = {
    scrollbarWidth: 'thin',
    scrollbarColor: 'var(--aihub-scroll-thumb) transparent',
    '&::-webkit-scrollbar': {
      width: '10px'
    },
    '&::-webkit-scrollbar-thumb': {
      background: 'var(--aihub-scroll-thumb)',
      border: '3px solid transparent',
      borderRadius: '999px',
      backgroundClip: 'padding-box',
      minHeight: '44px'
    },
    '&::-webkit-scrollbar-thumb:hover': {
      background: 'var(--aihub-scroll-thumb-hover)',
      border: '3px solid transparent',
      backgroundClip: 'padding-box'
    },
    '&::-webkit-scrollbar-track': {
      background: 'transparent'
    },
    '&::-webkit-scrollbar-corner': {
      background: 'transparent'
    }
  };

  const sidebarContent = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden'
      }}
    >
      {!matchUpMd && (
        <Box sx={{ pl: 3.5, pt: 2.5, pb: 1 }}>
          <LogoSection />
        </Box>
      )}

      <Box
        sx={{
          flex: '1 1 auto',
          overflowY: 'auto',
          overflowX: 'hidden',
          px: isMini ? 1 : 2,
          pt: matchUpMd ? 1 : 0,
          pb: 2,
          transition: `padding ${transitionDuration} ${transitionEasing}`,
          ...scrollbarStyles
        }}
      >
        {!isMini && <MenuCard />}
        <MenuList isMini={isMini} />
      </Box>

      {!isMini && (
        <Box
          sx={{
            flexShrink: 0,
            py: 1.25,
            px: 1.75,
            containerType: 'inline-size',
            borderTop: `1px dashed ${varAlpha(theme.palette.grey[500], 0.12)}`
          }}
        >
          <Box
            sx={{
              p: 0.75,
              borderRadius: 1,
              bgcolor: varAlpha(theme.palette.background.paper, isDark ? 0.18 : 0.42),
              border: `1px solid ${varAlpha(theme.palette.primary.main, 0.12)}`,
              boxShadow: `inset 0 1px 0 ${varAlpha(theme.palette.common.white, isDark ? 0.04 : 0.36)}`
            }}
          >
            {(() => {
              const hubService = footerStatuses[0];
              const childServices = footerStatuses.slice(1);
              const hubDotColor = hubService.ok ? theme.palette.success.main : theme.palette.error.main;

              return (
                <>
                  <Tooltip title={`${hubService.name} ${hubService.version || ''}: ${hubService.ok ? 'OK' : 'Down'}`} placement="top">
                    <Box
                      component="span"
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 0.75,
                        minWidth: 0,
                        px: 0.25,
                        pb: 0.65,
                        mb: 0.65,
                        borderBottom: `1px solid ${varAlpha(theme.palette.grey[500], 0.12)}`
                      }}
                    >
                      <Box
                        component="span"
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 0.55,
                          minWidth: 0,
                          color: theme.palette.text.secondary,
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          lineHeight: 1
                        }}
                      >
                        <Box
                          component="span"
                          sx={{
                            width: 8,
                            height: 8,
                            flex: '0 0 auto',
                            borderRadius: '50%',
                            bgcolor: hubDotColor,
                            boxShadow: `0 0 0 2px ${varAlpha(hubDotColor, 0.16)}`
                          }}
                        />
                        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          Hub
                        </Box>
                      </Box>
                      <Box
                        component="span"
                        sx={{
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: theme.palette.text.disabled,
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          lineHeight: 1,
                          textAlign: 'right'
                        }}
                      >
                        {hubService.version || t('menu.unknownVersion')}
                      </Box>
                    </Box>
                  </Tooltip>

                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      gap: 0.5,
                      '@container (max-width: 220px)': {
                        gridTemplateColumns: '1fr'
                      }
                    }}
                  >
                    {childServices.map((service) => {
                      const dotColor = service.ok ? theme.palette.success.main : theme.palette.error.main;

                      return (
                        <Tooltip
                          key={service.key}
                          title={`${service.name} ${service.version || ''}: ${service.ok ? 'OK' : 'Down'}`}
                          placement="top"
                        >
                          <Box
                            component="span"
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 0.5,
                              minWidth: 0,
                              px: 0.55,
                              py: 0.45,
                              borderRadius: 0.75,
                              bgcolor: varAlpha(theme.palette.primary.main, 0.08),
                              color: theme.palette.text.secondary,
                              fontSize: '0.68rem',
                              fontWeight: 800,
                              lineHeight: 1
                            }}
                          >
                            <Box
                              component="span"
                              sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 0.45,
                                minWidth: 0
                              }}
                            >
                              <Box
                                component="span"
                                sx={{
                                  width: 7,
                                  height: 7,
                                  flex: '0 0 auto',
                                  borderRadius: '50%',
                                  bgcolor: dotColor,
                                  boxShadow: `0 0 0 2px ${varAlpha(dotColor, 0.16)}`
                                }}
                              />
                              <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {service.label}
                              </Box>
                            </Box>
                            <Box
                              component="span"
                              sx={{
                                minWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                color: theme.palette.text.disabled,
                                fontSize: '0.66rem',
                                fontWeight: 700,
                                textAlign: 'right'
                              }}
                            >
                              {service.version || '-'}
                            </Box>
                          </Box>
                        </Tooltip>
                      );
                    })}
                  </Box>
                </>
              );
            })()}
          </Box>
        </Box>
      )}
    </Box>
  );

  const toggleButton = matchUpMd && (
    <IconButton
      className="aihub-sidebar-toggle"
      size="small"
      onClick={drawerToggle}
      sx={{
        p: 0.5,
        top: 24,
        position: 'fixed',
        color: 'action.active',
        bgcolor: 'background.default',
        transform: 'translateX(-50%)',
        zIndex: theme.zIndex.drawer + 2,
        left: `${currentWidth}px`,
        border: `1px solid ${varAlpha(theme.palette.grey[500], 0.12)}`,
        transition: `left ${transitionDuration} ${transitionEasing}`,
        '&:hover': {
          color: 'text.primary',
          bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'
        }
      }}
    >
      <SvgIcon sx={{ width: 16, height: 16, ...(isMini && { transform: 'scaleX(-1)' }) }}>
        <path
          fill="currentColor"
          d="M13.83 19a1 1 0 0 1-.78-.37l-4.83-6a1 1 0 0 1 0-1.27l5-6a1 1 0 0 1 1.54 1.28L10.29 12l4.32 5.36a1 1 0 0 1-.78 1.64"
        />
      </SvgIcon>
    </IconButton>
  );

  if (matchUpMd) {
    return (
      <>
        {toggleButton}
        <Box
          component="nav"
          className="aihub-sidebar-drawer"
          sx={{
            position: 'fixed',
            top: '64px',
            left: 0,
            height: 'calc(100% - 64px)',
            width: `${currentWidth}px`,
            zIndex: theme.zIndex.drawer,
            display: 'flex',
            flexDirection: 'column',
            bgcolor: 'background.default',
            borderRight: `1px solid ${varAlpha(theme.palette.grey[500], 0.12)}`,
            transition: `width ${transitionDuration} ${transitionEasing}`,
            overflowX: 'hidden'
          }}
        >
          {sidebarContent}
        </Box>
      </>
    );
  }

  return (
    <Box component="nav">
      <Drawer
        container={windowProp?.document.body}
        variant="temporary"
        anchor="left"
        open={drawerOpen}
        onClose={drawerToggle}
        sx={{
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            background: theme.palette.background.default,
            color: theme.palette.text.primary,
            borderRight: `1px solid ${varAlpha(theme.palette.grey[500], 0.12)}`,
            boxSizing: 'border-box',
            borderRadius: 0,
            top: '0',
            height: '100%',
            boxShadow: theme.shadows[8],
            zIndex: 1300,
            overflowX: 'hidden'
          },
          '& .MuiBackdrop-root': {
            zIndex: 1290
          }
        }}
        ModalProps={{
          keepMounted: true,
          closeAfterTransition: true
        }}
        color="inherit"
      >
        {sidebarContent}
      </Drawer>
    </Box>
  );
};

Sidebar.propTypes = {
  drawerOpen: PropTypes.bool,
  drawerToggle: PropTypes.func,
  window: PropTypes.object
};

export default Sidebar;
