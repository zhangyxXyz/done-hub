import { Stack, Typography, Box, Button, Divider } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import SubCard from 'ui-component/cards/SubCard';
import { IconMessageChatbot } from '@tabler/icons-react';
import { useSelector } from 'react-redux';
import { useState, useCallback } from 'react';
import { API } from 'utils/api';
import { replaceChatPlaceholders, getAvailableModelNames, getChatLinks } from 'utils/common';
import { IconAppWindow } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

const QuickStartCard = () => {
  const { t } = useTranslation();
  const [key, setKey] = useState('');
  const [modelNames, setModelNames] = useState([]);
  const theme = useTheme();
  const siteInfo = useSelector((state) => state.siteInfo);
  const chatLinks = getChatLinks(false);
  const baseServer = siteInfo.server_address;

  const loadModelNames = useCallback(async () => {
    if (modelNames.length > 0) return modelNames;

    const names = await getAvailableModelNames();
    setModelNames(names);
    return names;
  }, [modelNames]);

  const getProcessedUrl = useCallback(
    (url, key, models = []) => {
      let server = baseServer || window.location.host;
      server = encodeURIComponent(server);
      const useKey = 'sk-' + key;
      return replaceChatPlaceholders(url, useKey, server, encodeURIComponent(models.join(',')));
    },
    [baseServer]
  );

  const handleClick = async (url) => {
    const models = await loadModelNames();
    if (!key) {
      try {
        const res = await API.get(`/api/token/playground`);
        const { success, message, data } = res.data;
        if (success) {
          setKey(data);
          window.open(getProcessedUrl(url, data, models), '_blank');
        } else {
          console.log('message', message);
        }
      } catch (error) {
        console.error('Failed to get token:', error);
      }
    } else {
      window.open(getProcessedUrl(url, key, models), '_blank');
    }
  };

  return (
    <Box>
      <SubCard>
        <Stack spacing={3}>
          <Typography variant="h3" color={theme.palette.primary.dark}>
            {t('dashboard_index.quickStart')}
          </Typography>
          <Typography variant="body1" color="textSecondary">
            {t('dashboard_index.quickStartTip')}
          </Typography>

          <Stack direction="row" flexWrap="wrap" sx={{ gap: 2 }}>
            {chatLinks.map(
              (option, index) =>
                option.url.startsWith('http') && (
                  <Button
                    key={index}
                    variant="contained"
                    startIcon={<IconMessageChatbot />}
                    onClick={() => handleClick(option.url)}
                    sx={{
                      backgroundColor: theme.palette.primary.main,
                      color: 'white',
                      '&:hover': {
                        backgroundColor: theme.palette.primary.dark,
                        boxShadow: `0 0 3px 0 ${alpha(theme.palette.primary.main, 0.5)}`
                      },
                      textTransform: 'none',
                      boxShadow: `0 0 3px 0 ${alpha(theme.palette.primary.main, 0.5)}`
                    }}
                  >
                    {option.name}
                  </Button>
                )
            )}
          </Stack>
          <Divider />
          <Stack direction="row" flexWrap="wrap" sx={{ gap: 2 }}>
            {chatLinks.map(
              (option, index) =>
                !option.url.startsWith('http') && (
                  <Button
                    key={index}
                    variant="contained"
                    startIcon={<IconAppWindow />}
                    onClick={() => handleClick(option.url)}
                    sx={{
                      backgroundColor: theme.palette.primary.main,
                      color: 'white',
                      '&:hover': {
                        backgroundColor: theme.palette.primary.dark,
                        boxShadow: `0 0 3px 0 ${alpha(theme.palette.primary.main, 0.5)}`
                      },
                      textTransform: 'none',
                      boxShadow: `0 0 3px 0 ${alpha(theme.palette.primary.main, 0.5)}`
                    }}
                  >
                    {option.name}
                  </Button>
                )
            )}
          </Stack>
        </Stack>
      </SubCard>
    </Box>
  );
};

export default QuickStartCard;
