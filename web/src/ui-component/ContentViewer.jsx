import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { marked } from 'marked';
import { Box, Paper, Typography, CircularProgress } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import 'assets/css/content-viewer.css';

const customRuntimeScript = `<script data-aihub-runtime>
(function(){
  function readState(){
    var state = {
      theme: "light",
      themeMode: "auto",
      language: "zh_CN",
      defaultLanguage: "zh_CN"
    };

    try {
      if (parent.window.AIHub && typeof parent.window.AIHub.getState === "function") {
        state = Object.assign(state, parent.window.AIHub.getState());
      } else {
        state.theme =
          parent.document.documentElement.dataset.theme ||
          parent.localStorage.getItem("resolved_theme") ||
          parent.localStorage.getItem("theme") ||
          state.theme;
        state.themeMode = parent.document.documentElement.dataset.themeMode || parent.localStorage.getItem("theme") || state.themeMode;
        state.language = parent.document.documentElement.dataset.language || parent.localStorage.getItem("appLanguage") || state.language;
        state.defaultLanguage = parent.localStorage.getItem("default_language") || state.defaultLanguage;
      }
    } catch(e) {}

    if (!state.theme || state.theme === "system" || state.theme === "auto") {
      state.theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }

    state.theme = state.theme === "dark" ? "dark" : "light";
    state.language = state.language || state.defaultLanguage || "zh_CN";
    return state;
  }

  function applyState(){
    var state = readState();
    document.documentElement.setAttribute("data-theme", state.theme);
    document.documentElement.setAttribute("data-theme-mode", state.themeMode || "auto");
    document.documentElement.setAttribute("data-language", state.language);
    document.documentElement.setAttribute("lang", String(state.language).replace("_", "-"));

    window.AIHub = Object.assign(window.AIHub || {}, {
      state: state,
      getState: readState,
      setLanguage: function(language) {
        try {
          if (parent.window.AIHub && typeof parent.window.AIHub.setLanguage === "function") {
            parent.window.AIHub.setLanguage(language);
          }
        } catch(e) {}
      }
    });

    window.dispatchEvent(new CustomEvent("aihub:change", { detail: state }));
    window.dispatchEvent(new CustomEvent("aihub:language-change", { detail: { language: state.language, state: state } }));
  }

  applyState();
  setInterval(applyState, 500);
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

const htmlLang = (language) => (language || 'zh_CN').replace('_', '-');

const setHtmlRuntimeAttributes = (html, resolvedTheme, language) => {
  if (!resolvedTheme && !language) {
    return html;
  }

  if (!/<html\b/i.test(html)) {
    return html;
  }

  return html.replace(/<html\b([^>]*)>/i, (match, attrs) => {
    const setAttribute = (nextAttrs, name, value) => {
      if (!value) {
        return nextAttrs;
      }

      const attrRegex = new RegExp(`${name}\\s*=\\s*["'][^"']*["']`, 'i');
      if (attrRegex.test(nextAttrs)) {
        return nextAttrs.replace(attrRegex, `${name}="${value}"`);
      }

      return `${nextAttrs} ${name}="${value}"`;
    };

    let nextAttrs = attrs;
    nextAttrs = setAttribute(nextAttrs, 'data-theme', resolvedTheme);
    nextAttrs = setAttribute(nextAttrs, 'data-language', language);
    nextAttrs = setAttribute(nextAttrs, 'lang', htmlLang(language));

    return `<html${nextAttrs}>`;
  });
};

const injectCustomCss = (html, customCss, resolvedTheme, language) => {
  if (typeof window === 'undefined' || !html.trim().startsWith('<')) {
    return html;
  }

  const styleTag = customCss ? `<style data-aihub-custom-css>${customCss}</style>` : '';
  const themedHtml = setHtmlRuntimeAttributes(html, resolvedTheme, language);

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(themedHtml, 'text/html');
    doc.documentElement.setAttribute('data-theme', resolvedTheme);
    doc.documentElement.setAttribute('data-language', language);
    doc.documentElement.setAttribute('lang', htmlLang(language));

    if (!doc.head.querySelector('[data-aihub-runtime]')) {
      doc.head.insertAdjacentHTML('beforeend', customRuntimeScript);
    }
    if (styleTag && !doc.head.querySelector('[data-aihub-custom-css]')) {
      doc.head.insertAdjacentHTML('beforeend', styleTag);
    }

    doc.querySelectorAll('iframe[srcdoc]').forEach((iframe) => {
      const srcdoc = setHtmlRuntimeAttributes(iframe.getAttribute('srcdoc') || '', resolvedTheme, language);
      iframe.setAttribute('srcdoc', appendToHead(appendToHead(srcdoc, customRuntimeScript), styleTag));
    });

    return doc.body.innerHTML;
  } catch (error) {
    return appendToHead(appendToHead(themedHtml, customRuntimeScript), styleTag);
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
  const siteInfo = useSelector((state) => state.siteInfo);
  const { i18n } = useTranslation();
  const resolvedTheme = theme.palette.mode === 'dark' ? 'dark' : 'light';
  const language = i18n.language || localStorage.getItem('appLanguage') || siteInfo.language || 'zh_CN';
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
      setParsedContent(injectCustomCss(content, customCss, resolvedTheme, language));
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
  }, [content, customCss, resolvedTheme, language]);

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
        <Typography color="error" variant="body1">
          {errorMessage}
        </Typography>
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
          data-theme={resolvedTheme}
          data-language={language}
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
          data-theme={resolvedTheme}
          data-language={language}
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
