import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { marked } from 'marked';
import { Box, Paper, Typography, CircularProgress } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useSelector } from 'react-redux';
import 'assets/css/content-viewer.css';

const themeSyncScript = `<script data-aihub-theme-sync>
(function(){
  function syncTheme(){
    var theme = "light";
    try {
      theme =
        parent.document.documentElement.dataset.theme ||
        parent.localStorage.getItem("resolved_theme") ||
        parent.localStorage.getItem("theme") ||
        "";
    } catch(e) {}

    if (!theme || theme === "system" || theme === "auto") {
      theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }

    document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
  }

  syncTheme();
  setInterval(syncTheme, 500);
})();
</script>`;

const appendToHead = (html, insertion) => {
  if (!insertion || html.includes(insertion.slice(0, insertion.indexOf('>') + 1))) {
    return html;
  }

  if (html.includes('</head>')) {
    return html.replace('</head>', `${insertion}</head>`);
  }

  return `${insertion}${html}`;
};

const setHtmlTheme = (html, resolvedTheme) => {
  if (!resolvedTheme) {
    return html;
  }

  if (!/<html\b/i.test(html)) {
    return html;
  }

  return html.replace(/<html\b([^>]*)>/i, (match, attrs) => {
    if (/data-theme\s*=/.test(attrs)) {
      return `<html${attrs.replace(/data-theme\s*=\s*["'][^"']*["']/i, `data-theme="${resolvedTheme}"`)}>`;
    }

    return `<html${attrs} data-theme="${resolvedTheme}">`;
  });
};

const injectCustomCss = (html, customCss, resolvedTheme) => {
  if (typeof window === 'undefined' || !html.trim().startsWith('<')) {
    return html;
  }

  const styleTag = customCss ? `<style data-aihub-custom-css>${customCss}</style>` : '';
  const themedHtml = setHtmlTheme(html, resolvedTheme);

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(themedHtml, 'text/html');
    doc.documentElement.setAttribute('data-theme', resolvedTheme);

    if (!doc.head.querySelector('[data-aihub-theme-sync]')) {
      doc.head.insertAdjacentHTML('beforeend', themeSyncScript);
    }
    if (styleTag && !doc.head.querySelector('[data-aihub-custom-css]')) {
      doc.head.insertAdjacentHTML('beforeend', styleTag);
    }

    doc.querySelectorAll('iframe[srcdoc]').forEach((iframe) => {
      const srcdoc = setHtmlTheme(iframe.getAttribute('srcdoc') || '', resolvedTheme);
      iframe.setAttribute('srcdoc', appendToHead(appendToHead(srcdoc, themeSyncScript), styleTag));
    });

    return doc.body.innerHTML;
  } catch (error) {
    return appendToHead(appendToHead(themedHtml, themeSyncScript), styleTag);
  }
};

/**
 * ContentViewer component for displaying Markdown or HTML content
 * 
 * @param {Object} props - Component props
 * @param {string} props.content - The content to display (Markdown, HTML, or URL)
 * @param {boolean} props.loading - Whether the content is loading
 * @param {string} props.errorMessage - Error message to display if loading fails
 * @param {Object} props.containerStyle - Additional styles for the container
 * @param {Object} props.contentStyle - Additional styles for the content
 * @param {number} props.iframeHeight - Height for iframe (when content is a URL)
 * @returns {React.ReactElement} The rendered component
 */
const ContentViewer = ({ 
  content, 
  loading = false, 
  errorMessage = '', 
  containerStyle = {}, 
  contentStyle = {},
  disablePadding = false,
  iframeHeight = '100vh'
}) => {
  const theme = useTheme();
  const customCss = useSelector((state) => state.siteInfo.custom_css);
  const resolvedTheme = theme.palette.mode === 'dark' ? 'dark' : 'light';
  const [parsedContent, setParsedContent] = useState('');
  const [isUrl, setIsUrl] = useState(false);

  useEffect(() => {
    if (!content) {
      setParsedContent('');
      setIsUrl(false);
      return;
    }

    // Check if content is a URL
    if (content.startsWith('http://') || content.startsWith('https://')) {
      setIsUrl(true);
      setParsedContent(content);
      return;
    }

    // Check if content is already HTML
    if (content.trim().startsWith('<') && content.includes('</')) {
      setIsUrl(false);
      setParsedContent(injectCustomCss(content, customCss, resolvedTheme));
      return;
    }

    // Parse as Markdown
    try {
      const parsed = marked.parse(content);
      setParsedContent(parsed);
      setIsUrl(false);
    } catch (error) {
      console.error('Error parsing markdown:', error);
      setParsedContent(content); // Fallback to raw content
      setIsUrl(false);
    }
  }, [content, customCss, resolvedTheme]);

  if (loading) {
    return (
      <Box 
        sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          minHeight: '200px',
          ...containerStyle
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (errorMessage) {
    return (
      <Box 
        sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          minHeight: '200px',
          ...containerStyle
        }}
      >
        <Typography color="error" variant="body1">{errorMessage}</Typography>
      </Box>
    );
  }

  if (!content) {
    return null;
  }

  return (
    <Paper 
      elevation={0} 
      sx={{ 
        overflow: 'hidden',
        backgroundColor: disablePadding ? theme.palette.background.default : 'transparent',
        borderRadius: disablePadding ? 0 : undefined,
        m: disablePadding ? 0 : undefined,
        p: disablePadding ? 0 : undefined,
        position: disablePadding ? 'fixed' : undefined,
        inset: disablePadding ? 0 : undefined,
        zIndex: disablePadding ? 0 : undefined,
        width: disablePadding ? '100vw' : undefined,
        height: disablePadding ? '100dvh' : undefined,
        ...containerStyle
      }}
    >
      {isUrl ? (
        <iframe 
          title="content-frame" 
          src={parsedContent} 
          style={{ 
            width: '100%', 
            height: iframeHeight, 
            border: 'none',
            ...contentStyle
          }} 
        />
      ) : (
        <Box 
          className="content-viewer"
          sx={{ 
            fontSize: 'inherit',
            lineHeight: 1.6,
            p: disablePadding ? '0 !important' : undefined,
            m: disablePadding ? '0 !important' : undefined,
            width: disablePadding ? '100vw' : undefined,
            height: disablePadding ? '100dvh' : undefined,
            overflow: disablePadding ? 'hidden' : undefined,
            '& img': {
              maxWidth: '100%',
              height: 'auto'
            },
            ...(disablePadding
              ? {
                  '& > iframe:only-child': {
                    display: 'block',
                    width: '100vw !important',
                    maxWidth: '100vw !important',
                    minHeight: '100vh',
                    height: '100dvh !important',
                    border: '0 !important'
                  }
                }
              : {}),
            ...contentStyle
          }} 
          dangerouslySetInnerHTML={{ __html: parsedContent }}
        />
      )}
    </Paper>
  );
};

ContentViewer.propTypes = {
  content: PropTypes.string,
  loading: PropTypes.bool,
  errorMessage: PropTypes.string,
  containerStyle: PropTypes.object,
  contentStyle: PropTypes.object,
  disablePadding: PropTypes.bool,
  iframeHeight: PropTypes.string
};

export default ContentViewer;
