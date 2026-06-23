import React, { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { API } from 'utils/api';
import { showError } from 'utils/common';
import { Box, Container, Typography } from '@mui/material';
import MainCard from 'ui-component/cards/MainCard';
import { useTranslation } from 'react-i18next';
import ContentViewer from 'ui-component/ContentViewer';
import { PROJECT_REPOSITORY_URL } from 'constants/CommonConstants';

const About = () => {
  const { t } = useTranslation();
  const { setCustomContent, headerHeight, footerHeight } = useOutletContext() || {};
  const [about, setAbout] = useState('');
  const [aboutLoaded, setAboutLoaded] = useState(false);
  const hasCustomContent = aboutLoaded && about !== '' && about !== t('about.loadingError');

  const displayAbout = useCallback(async () => {
    setAbout(localStorage.getItem('about') || '');
    try {
      const res = await API.get('/api/about');
      const { success, message, data } = res.data;
      if (success) {
        setAbout(data);
        localStorage.setItem('about', data);
      } else {
        showError(message);
        setAbout(t('about.loadingError'));
      }
    } catch (error) {
      setAbout(t('about.loadingError'));
    }

    setAboutLoaded(true);
  }, [t]);

  useEffect(() => {
    displayAbout();
  }, [displayAbout]);

  useEffect(() => {
    setCustomContent?.(hasCustomContent);

    return () => {
      setCustomContent?.(false);
    };
  }, [hasCustomContent, setCustomContent]);

  return (
    <>
      {aboutLoaded && about === '' ? (
        <Box>
          <Container sx={{ paddingTop: '40px' }}>
            <MainCard title={t('about.aboutTitle')}>
              <Typography variant="body2">
                {t('about.aboutDescription')} <br />
                {t('about.projectRepo')}
                <a href={PROJECT_REPOSITORY_URL}>{PROJECT_REPOSITORY_URL}</a>
              </Typography>
            </MainCard>
          </Container>
        </Box>
      ) : (
        <Box>
          <ContentViewer
            content={about}
            loading={!aboutLoaded}
            errorMessage={about === t('about.loadingError') ? t('about.loadingError') : ''}
            containerStyle={{
              top: hasCustomContent ? headerHeight : undefined,
              minHeight: hasCustomContent ? `calc(100dvh - ${headerHeight || '0px'} - ${footerHeight || '0px'})` : 'calc(100vh - 136px)',
              overflowX: 'hidden'
            }}
            contentStyle={{
              fontSize: 'larger'
            }}
            disablePadding={hasCustomContent}
            scrollContainer={!hasCustomContent}
            enableScripts={hasCustomContent}
          />
        </Box>
      )}
    </>
  );
};

export default About;
