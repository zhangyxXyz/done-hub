import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { showError } from 'utils/common';
import { API } from 'utils/api';
import BaseIndex from './baseIndex';
import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import ContentViewer from 'ui-component/ContentViewer';

const Home = () => {
  const { t } = useTranslation();
  const { setCustomContent, headerHeight, footerHeight } = useOutletContext() || {};
  const [homePageContentLoaded, setHomePageContentLoaded] = useState(false);
  const [homePageContent, setHomePageContent] = useState('');
  const hasCustomContent = homePageContentLoaded && homePageContent !== '' && homePageContent !== t('home.loadingErr');

  const displayHomePageContent = async () => {
    setHomePageContent(localStorage.getItem('home_page_content') || '');
    try {
      const res = await API.get('/api/home_page_content');
      const { success, message, data } = res.data;
      if (success) {
        setHomePageContent(data);
        localStorage.setItem('home_page_content', data);
      } else {
        showError(message);
        setHomePageContent(t('home.loadingErr'));
      }
      setHomePageContentLoaded(true);
    } catch (error) {
      return;
    }
  };

  useEffect(() => {
    displayHomePageContent().then();
  }, []);

  useEffect(() => {
    setCustomContent?.(hasCustomContent);

    return () => {
      setCustomContent?.(false);
    };
  }, [hasCustomContent, setCustomContent]);

  return (
    <>
      {homePageContentLoaded && homePageContent === '' ? (
        <BaseIndex />
      ) : (
        <Box>
          <ContentViewer
            content={homePageContent}
            loading={!homePageContentLoaded}
            errorMessage={homePageContent === t('home.loadingErr') ? t('home.loadingErr') : ''}
            containerStyle={{
              top: hasCustomContent ? headerHeight : undefined,
              minHeight: hasCustomContent ? `calc(100dvh - ${headerHeight || '0px'} - ${footerHeight || '0px'})` : 'calc(100vh - 136px)',
              bottom: hasCustomContent ? footerHeight : undefined
            }}
            contentStyle={{
              fontSize: 'larger',
              minHeight: hasCustomContent ? `calc(100dvh - ${headerHeight || '0px'} - ${footerHeight || '0px'})` : undefined
            }}
            disablePadding={hasCustomContent}
            autoResizeEmbeddedFrames={!hasCustomContent}
          />
        </Box>
      )}
    </>
  );
};

export default Home;
