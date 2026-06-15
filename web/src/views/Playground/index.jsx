import PropTypes from 'prop-types';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { API } from 'utils/api';
import { getChatLinks, getAvailableModelNames, showError, replaceChatPlaceholders } from 'utils/common';
import { Typography, Tabs, Tab, Box, Card } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import SubCard from 'ui-component/cards/SubCard';
// import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';

function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`playground-tabpanel-${index}`}
      aria-labelledby={`playground-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          <Typography>{children}</Typography>
        </Box>
      )}
    </div>
  );
}

TabPanel.propTypes = {
  children: PropTypes.node,
  index: PropTypes.number.isRequired,
  value: PropTypes.number.isRequired
};

function a11yProps(index) {
  return {
    id: `playground-tab-${index}`,
    'aria-controls': `playground-tabpanel-${index}`
  };
}

const Playground = () => {
  const theme = useTheme();
  const [value, setValue] = useState('');
  const [tabIndex, setTabIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const siteInfo = useSelector((state) => state.siteInfo);
  const chatLinks = useMemo(() => getChatLinks(true), []);
  const [iframeSrc, setIframeSrc] = useState(null);
  const [modelNames, setModelNames] = useState([]);
  const iframeSandbox = 'allow-scripts allow-forms allow-popups allow-downloads allow-modals allow-same-origin';

  const applyChatTheme = useCallback((rawUrl, mode) => {
    const normalizedMode = mode === 'dark' ? 'dark' : 'light';

    try {
      const isRelativeUrl = rawUrl.startsWith('/');
      const url = new URL(rawUrl, window.location.origin);
      url.searchParams.set('theme', normalizedMode);

      const hash = url.hash || '';
      const queryIndex = hash.indexOf('?');
      if (queryIndex !== -1) {
        const hashPath = hash.slice(0, queryIndex);
        const hashSearch = new URLSearchParams(hash.slice(queryIndex + 1));
        hashSearch.set('theme', normalizedMode);

        const settings = hashSearch.get('settings');
        if (settings) {
          try {
            const parsedSettings = JSON.parse(settings);
            parsedSettings.theme = normalizedMode;
            parsedSettings.mode = normalizedMode;
            hashSearch.set('settings', JSON.stringify(parsedSettings));
          } catch (error) {
            // Keep the original settings when a third-party link uses a non-JSON shape.
          }
        }

        url.hash = `${hashPath}?${hashSearch.toString()}`;
      }

      return isRelativeUrl ? `${url.pathname}${url.search}${url.hash}` : url.toString();
    } catch (error) {
      return rawUrl;
    }
  }, []);

  const buildIframeSrc = useCallback(
    (index, tokenValue, mode, models = []) => {
      let server = '';
      if (siteInfo?.server_address) {
        server = siteInfo.server_address;
      } else {
        server = window.location.host;
      }
      server = encodeURIComponent(server);
      const key = 'sk-' + tokenValue;

      return applyChatTheme(replaceChatPlaceholders(chatLinks[index].url, key, server, encodeURIComponent(models.join(','))), mode);
    },
    [applyChatTheme, chatLinks, siteInfo]
  );

  const loadTokens = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await API.get(`/api/token/playground`);
      const names = await getAvailableModelNames();
      setModelNames(names);
      const { success, message, data } = res.data;
      if (success) {
        setValue(data);
        setIframeSrc(buildIframeSrc(tabIndex, data, theme.palette.mode, names));
      } else {
        showError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [buildIframeSrc, tabIndex, theme.palette.mode]);

  const handleTabChange = useCallback(
    (event, newIndex) => {
      setTabIndex(newIndex);
      setIframeSrc(buildIframeSrc(newIndex, value, theme.palette.mode, modelNames));
    },
    [buildIframeSrc, modelNames, theme.palette.mode, value]
  );

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  useEffect(() => {
    if (value !== '' && chatLinks.length > 0 && modelNames.length > 0) {
      setIframeSrc(buildIframeSrc(tabIndex, value, theme.palette.mode, modelNames));
    }
  }, [buildIframeSrc, chatLinks.length, modelNames, tabIndex, theme.palette.mode, value]);

  if (chatLinks.length === 0 || isLoading || value === '' || !iframeSrc) {
    return (
      <SubCard title="Playground">
        <Typography align="center">{isLoading ? 'Loading...' : 'No playground available'}</Typography>
      </SubCard>
    );
  } else if (chatLinks.length === 1) {
    return (
      <iframe
        key={`${theme.palette.mode}-${iframeSrc}`}
        title="playground"
        src={iframeSrc}
        referrerPolicy="no-referrer"
        sandbox={iframeSandbox}
        style={{ width: '100%', height: '85vh', border: 'none' }}
      />
    );
  } else {
    return (
      <Card>
        <Tabs variant="scrollable" value={tabIndex} onChange={handleTabChange} sx={{ borderRight: 1, borderColor: 'divider' }}>
          {chatLinks.map((link, index) => link.show && <Tab label={link.name} {...a11yProps(index)} key={index} />)}
        </Tabs>
        <Box>
          <iframe
            key={`${theme.palette.mode}-${iframeSrc}`}
            title="playground"
            src={iframeSrc}
            referrerPolicy="no-referrer"
            sandbox={iframeSandbox}
            style={{ width: '100%', height: '85vh', border: 'none' }}
          />
        </Box>
      </Card>
    );
  }
};

export default Playground;
