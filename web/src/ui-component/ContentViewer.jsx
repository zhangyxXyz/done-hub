import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { marked } from 'marked';
import { createPortal } from 'react-dom';
import { Box, Paper, Typography, CircularProgress } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import CustomHomeProviderMarquee from './CustomHomeProviderMarquee';
import ApiTerminalDemo from '../views/Home/components/ApiTerminalDemo';
import 'assets/css/content-viewer.css';

const NATIVE_WIDGET_PATTERN = /(^|\n)\s*<aihub-(model-marquee|api-terminal)\b([^>]*)(?:\/>|>\s*<\/aihub-\2>)\s*/gi;
const DEFAULT_IFRAME_SANDBOX = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals';

const customRuntimeScript = `<script data-aihub-runtime>
(function(){
  var legacyHitokotoEndpoints = [
    "https://service.onlyzyx.com/oneword/",
    "http://service.onlyzyx.com/oneword/"
  ];
  var hitokotoFallbackUrl = "https://v1.hitokoto.cn/?encode=json";

  if (!window.__aihubHitokotoFetchPatched && typeof window.fetch === "function") {
    var nativeFetch = window.fetch.bind(window);
    window.fetch = function(input, init) {
      var url = "";

      try {
        url = typeof input === "string" ? input : input && input.url;
      } catch(e) {}

      if (legacyHitokotoEndpoints.indexOf(url) !== -1) {
        return nativeFetch(hitokotoFallbackUrl, init);
      }

      return nativeFetch(input, init);
    };
    window.__aihubHitokotoFetchPatched = true;
  }

  function readState(){
    var state = {
      theme: "light",
      themeMode: "auto",
      language: "zh_CN",
      defaultLanguage: "zh_CN",
      primaryColor: "default",
      isLoggedIn: false
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
        state.primaryColor = parent.document.documentElement.dataset.primaryColor || parent.localStorage.getItem("primaryColor") || state.primaryColor;
        state.language = parent.document.documentElement.dataset.language || parent.localStorage.getItem("appLanguage") || state.language;
        state.defaultLanguage = parent.localStorage.getItem("default_language") || state.defaultLanguage;
      }
    } catch(e) {}

    if (!state.theme || state.theme === "system" || state.theme === "auto") {
      state.theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }

    state.theme = state.theme === "dark" ? "dark" : "light";
    state.language = state.language || state.defaultLanguage || "zh_CN";
    state.primaryColor = state.primaryColor || "default";
    return state;
  }

  function syncThemeVars(){
    try {
      var parentStyle = parent.getComputedStyle(parent.document.documentElement);
      var rootStyle = document.documentElement.style;
      for (var i = 0; i < parentStyle.length; i += 1) {
        var name = parentStyle[i];
        if (name && name.indexOf("--aihub-") === 0) {
          rootStyle.setProperty(name, parentStyle.getPropertyValue(name));
        }
      }
    } catch(e) {}
  }

  function applyState(){
    var state = readState();
    document.documentElement.setAttribute("data-theme", state.theme);
    document.documentElement.setAttribute("data-theme-mode", state.themeMode || "auto");
    document.documentElement.setAttribute("data-primary-color", state.primaryColor);
    document.documentElement.setAttribute("data-language", state.language);
    document.documentElement.setAttribute("lang", String(state.language).replace("_", "-"));
    syncThemeVars();

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

  function syncFrameHeight(){
    try {
      if (!window.frameElement) return;
      if (window.frameElement.getAttribute("data-aihub-auto-height") === "false") {
        window.frameElement.setAttribute("scrolling", "no");
        window.frameElement.style.height = "100%";
        return;
      }
      var doc = document.documentElement;
      var body = document.body;
      var height = Math.max(
        doc ? doc.scrollHeight : 0,
        doc ? doc.offsetHeight : 0,
        body ? body.scrollHeight : 0,
        body ? body.offsetHeight : 0
      );
      window.frameElement.setAttribute("scrolling", "no");
      window.frameElement.style.height = height + "px";
    } catch(e) {}
  }

  applyState();
  syncFrameHeight();
  setInterval(applyState, 500);
  setInterval(syncFrameHeight, 500);
  window.addEventListener("load", syncFrameHeight);
  window.addEventListener("resize", syncFrameHeight);
})();
</script>`;

const iframeScrollStyle = `<style data-aihub-iframe-scroll>
html,body{min-height:100%;width:100%;max-width:100%;overflow-x:hidden!important;overflow-y:auto;overscroll-behavior-x:none;}
*,*::before,*::after{box-sizing:border-box;}
img,svg,video,canvas{max-width:100%;height:auto;}
html body .aihub-page.aihub-page{width:100%!important;max-width:100%!important;min-height:100%!important;overflow-x:clip!important;}
html body .aihub-page.aihub-page > *{max-width:100%!important;}
::-webkit-scrollbar:horizontal{height:0!important;display:none!important;}
html body .aihub-card.aihub-card,html body .aihub-home__wrap.aihub-home__wrap{width:min(100%,1120px)!important;max-width:calc(100% - 32px)!important;margin-left:auto!important;margin-right:auto!important;}
@media (max-width:600px){
  html body .aihub-card.aihub-card,html body .aihub-home__wrap.aihub-home__wrap{max-width:calc(100% - 24px)!important;}
  html body .aihub-home__wrap.aihub-home__wrap{display:flex!important;flex-direction:column!important;justify-content:center!important;align-items:center!important;text-align:center!important;min-height:calc(100dvh - 160px)!important;padding-left:clamp(18px,6vw,28px)!important;padding-right:clamp(18px,6vw,28px)!important;}
  html body .aihub-home__wrap.aihub-home__wrap > *{margin-left:auto!important;margin-right:auto!important;}
  html body .aihub-home__wrap.aihub-home__wrap :is(h1,h2,h3,p,div,span){text-align:center!important;}
  html body .aihub-home__wrap.aihub-home__wrap :is(.aihub-home__actions,.aihub-actions){justify-content:center!important;}
  .aihub-title{font-size:clamp(32px,12vw,56px)!important;}
}
</style>`;

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

const nativeSlotClassName = (type) => (type === 'api-terminal' ? 'aihub-terminal-wrap' : '');

const readAttribute = (attrs, name) => {
  const match = String(attrs || '').match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match?.[1] || '';
};

const appendTrustedHtmlToHead = (doc, selector, html) => {
  if (!doc.head.querySelector(selector)) {
    doc.head.insertAdjacentHTML('beforeend', html);
  }
};

const appendCustomCssToHead = (doc, customCss) => {
  if (!customCss || doc.head.querySelector('[data-aihub-custom-css]')) {
    return;
  }

  const style = doc.createElement('style');
  style.setAttribute('data-aihub-custom-css', '');
  style.textContent = customCss;
  doc.head.appendChild(style);
};

const setDefaultIframeSandbox = (iframe) => {
  if (!iframe.hasAttribute('sandbox')) {
    iframe.setAttribute('sandbox', DEFAULT_IFRAME_SANDBOX);
  }
};

const escapeAttribute = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const transformNativeContent = (html) => {
  let index = 0;
  NATIVE_WIDGET_PATTERN.lastIndex = 0;

  return html.replace(NATIVE_WIDGET_PATTERN, (match, prefix, type, attrs) => {
    const id = `aihub-native-${index}`;
    index += 1;
    const className = nativeSlotClassName(type);
    const classAttr = className ? ` class="${className}"` : '';
    const protocols = readAttribute(attrs, 'protocols');
    const protocolsAttr = protocols ? ` data-aihub-protocols="${escapeAttribute(protocols)}"` : '';
    return `${prefix || ''}<div${classAttr} data-aihub-native-slot="${type}" data-aihub-native-id="${id}"${protocolsAttr}></div>`;
  });
};

const customHomeNativeSx = (theme) => ({
  width: '100%',
  maxWidth: 1120,
  mx: 'auto',
  px: { xs: 2.5, sm: 4 },
  py: { xs: 7, md: 10 },
  color: theme.palette.text.primary,
  '& main': {
    display: 'grid',
    gap: { xs: 7, md: 10 }
  },
  '& section': {
    maxWidth: 760
  },
  '& section:has([data-aihub-native="model-marquee"])': {
    maxWidth: 'none',
    width: '100%'
  },
  '& h1, & h2': {
    borderBottom: '0 !important',
    p: '0 !important',
    mt: '0 !important',
    mb: '18px !important',
    color: theme.palette.text.primary,
    letterSpacing: '0 !important',
    lineHeight: 1.08,
    fontWeight: 700
  },
  '& h1': {
    fontSize: { xs: '2.6rem', md: '4.8rem' }
  },
  '& h2': {
    fontSize: { xs: '2rem', md: '3rem' }
  },
  '& p': {
    maxWidth: 720,
    mt: '0 !important',
    mb: '18px !important',
    color: theme.palette.text.secondary,
    fontSize: { xs: '1rem', md: '1.08rem' },
    lineHeight: 1.7
  },
  '& section > p:first-of-type': {
    color: theme.palette.primary.main,
    fontSize: '0.76rem',
    fontWeight: 700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    mb: '20px !important'
  },
  '& a': {
    color: theme.palette.primary.main,
    fontWeight: 700
  },
  '& [data-aihub-native="model-marquee"]': {
    mt: { xs: 3, md: 5 },
    mb: 0
  }
});

const setHtmlRuntimeAttributes = (html, resolvedTheme, language, primaryColor) => {
  if (!resolvedTheme && !language && !primaryColor) {
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
    nextAttrs = setAttribute(nextAttrs, 'data-primary-color', primaryColor);
    nextAttrs = setAttribute(nextAttrs, 'data-language', language);
    nextAttrs = setAttribute(nextAttrs, 'lang', htmlLang(language));

    return `<html${nextAttrs}>`;
  });
};

const injectFrameSrcdoc = (html, customCss, resolvedTheme, language, primaryColor, autoResizeEmbeddedFrames) => {
  const themedHtml = setHtmlRuntimeAttributes(html, resolvedTheme, language, primaryColor);

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(themedHtml, 'text/html');
    doc.documentElement.setAttribute('data-theme', resolvedTheme);
    doc.documentElement.setAttribute('data-primary-color', primaryColor);
    doc.documentElement.setAttribute('data-language', language);
    doc.documentElement.setAttribute('lang', htmlLang(language));
    appendTrustedHtmlToHead(doc, '[data-aihub-runtime]', customRuntimeScript);
    appendCustomCssToHead(doc, customCss);
    appendTrustedHtmlToHead(doc, '[data-aihub-iframe-scroll]', iframeScrollStyle);

    doc.querySelectorAll('iframe').forEach((iframe) => {
      setDefaultIframeSandbox(iframe);
      iframe.setAttribute('data-aihub-auto-height', autoResizeEmbeddedFrames ? 'true' : 'false');
    });

    return doc.documentElement.outerHTML;
  } catch (error) {
    // DOMParser should handle arbitrary strings, but keep a conservative
    // fallback for malformed custom admin content.
    return appendToHead(appendToHead(themedHtml, customRuntimeScript), iframeScrollStyle);
  }
};

const injectCustomCss = (html, customCss, resolvedTheme, language, primaryColor, autoResizeEmbeddedFrames = true) => {
  if (typeof window === 'undefined' || !html.trim().startsWith('<')) {
    return html;
  }

  const themedHtml = setHtmlRuntimeAttributes(html, resolvedTheme, language, primaryColor);

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(themedHtml, 'text/html');
    doc.documentElement.setAttribute('data-theme', resolvedTheme);
    doc.documentElement.setAttribute('data-primary-color', primaryColor);
    doc.documentElement.setAttribute('data-language', language);
    doc.documentElement.setAttribute('lang', htmlLang(language));

    appendTrustedHtmlToHead(doc, '[data-aihub-runtime]', customRuntimeScript);
    appendCustomCssToHead(doc, customCss);
    appendTrustedHtmlToHead(doc, '[data-aihub-iframe-scroll]', iframeScrollStyle);

    doc.querySelectorAll('iframe').forEach((iframe) => {
      setDefaultIframeSandbox(iframe);
      iframe.setAttribute('data-aihub-auto-height', autoResizeEmbeddedFrames ? 'true' : 'false');
      if (iframe.hasAttribute('srcdoc')) {
        iframe.setAttribute(
          'srcdoc',
          injectFrameSrcdoc(iframe.getAttribute('srcdoc') || '', customCss, resolvedTheme, language, primaryColor, autoResizeEmbeddedFrames)
        );
      }
    });

    return doc.body.innerHTML;
  } catch (error) {
    // Keep rendering malformed trusted custom content, but avoid injecting
    // administrator CSS through an HTML string in the fallback path.
    return appendToHead(appendToHead(themedHtml, customRuntimeScript), iframeScrollStyle);
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
  iframeHeight = '100vh',
  autoResizeEmbeddedFrames = true,
  scrollContainer = true,
  enableScripts = false
}) => {
  const theme = useTheme();
  const customCss = useSelector((state) => state.siteInfo.custom_css);
  const siteInfo = useSelector((state) => state.siteInfo);
  const primaryColor = useSelector((state) => state.customization.primaryColor);
  const { i18n } = useTranslation();
  const resolvedTheme = theme.palette.mode === 'dark' ? 'dark' : 'light';
  const language = i18n.language || localStorage.getItem('appLanguage') || siteInfo.language || 'zh_CN';
  const [parsedContent, setParsedContent] = useState('');
  const [isUrl, setIsUrl] = useState(false);
  const [nativeSlots, setNativeSlots] = useState([]);
  const contentRef = useRef(null);
  const hasNativeWidget = !isUrl && parsedContent.includes('data-aihub-native-slot=');
  const useNativeLayout = hasNativeWidget && !parsedContent.includes('aihub-landing');

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
      setParsedContent(injectCustomCss(transformNativeContent(content), customCss, resolvedTheme, language, primaryColor, autoResizeEmbeddedFrames));
      return;
    }

    // Parse as Markdown
    try {
      const parsed = transformNativeContent(marked.parse(content));
      setParsedContent(parsed);
      setIsUrl(false);
    } catch (error) {
      console.error('Error parsing markdown:', error);
      setParsedContent(content); // Fallback to raw content
      setIsUrl(false);
    }
  }, [content, customCss, resolvedTheme, language, primaryColor, autoResizeEmbeddedFrames]);

  useEffect(() => {
    if (isUrl || !parsedContent || !contentRef.current) {
      return undefined;
    }

    const scripts = Array.from(contentRef.current.querySelectorAll('script'));
    if (enableScripts) {
      scripts.forEach((script) => {
        const type = script.getAttribute('type');
        const isJavaScript = !type || type === 'text/javascript' || type === 'application/javascript' || type === 'module';

        if (!isJavaScript) {
          return;
        }

        if (script.src) {
          const replacement = document.createElement('script');
          Array.from(script.attributes).forEach((attribute) => {
            replacement.setAttribute(attribute.name, attribute.value);
          });
          script.replaceWith(replacement);
          return;
        }

        const scriptText = script.textContent;
        script.remove();

        if (!scriptText.trim()) {
          return;
        }

        try {
          // Only enable this for trusted root/admin-authored site configuration.
          // ContentViewer intentionally does not sanitize arbitrary user HTML.
          Function(scriptText)();
        } catch (error) {
          console.error('Error executing custom content script:', error);
        }
      });
    } else {
      scripts.forEach((script) => script.remove());
    }

    const targets = Array.from(contentRef.current.querySelectorAll('[data-aihub-hitokoto]'));
    if (!targets.length) {
      return undefined;
    }

    const controller = new AbortController();

    const endpoints = ['https://service.onlyzyx.com/oneword/', 'https://v1.hitokoto.cn/?encode=json'];

    const loadHitokoto = () =>
      endpoints.reduce(
        (request, url) =>
          request.catch(() =>
            fetch(url, { signal: controller.signal }).then((response) =>
              response.ok ? response.json() : Promise.reject(new Error('hitokoto request failed'))
            )
          ),
        Promise.reject()
      );

    targets.forEach((target) => {
      if (target.dataset.aihubHitokotoLoaded === 'true') {
        return;
      }

      const textNode = target.querySelector('[data-aihub-hitokoto-text]') || target;
      const fromNode = target.querySelector('[data-aihub-hitokoto-from]');
      const fallbackText = textNode.textContent;
      const fallbackFrom = fromNode?.textContent;

      target.dataset.aihubHitokotoLoaded = 'true';

      loadHitokoto()
        .then((data) => {
          const text = data?.hitokoto || data?.content || data?.text || data?.sentence || data?.data;
          if (text) {
            textNode.textContent = text;
          }
          if (fromNode) {
            const author = data?.from_who || data?.author || '';
            const from = data?.from || data?.source || '';
            const source = [author, from ? `《${from}》` : ''].filter(Boolean).join('');
            fromNode.textContent = source ? `— ${source}` : '';
          }
        })
        .catch(() => {
          textNode.textContent = fallbackText;
          if (fromNode) {
            fromNode.textContent = fallbackFrom || '';
          }
        });
    });

    return () => controller.abort();
  }, [isUrl, parsedContent, enableScripts]);

  useEffect(() => {
    if (!hasNativeWidget || !contentRef.current) {
      setNativeSlots([]);
      return;
    }

    const slots = Array.from(contentRef.current.querySelectorAll('[data-aihub-native-slot]')).map((node) => ({
      id: node.getAttribute('data-aihub-native-id'),
      type: node.getAttribute('data-aihub-native-slot'),
      protocols: node.getAttribute('data-aihub-protocols') || '',
      node
    }));

    setNativeSlots(slots);
  }, [hasNativeWidget, parsedContent]);

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

  const nativePortals = nativeSlots.map((slot) => {
    if (slot.type === 'model-marquee') {
      return createPortal(
        <Box data-aihub-native="model-marquee" sx={{ width: '100%', my: 0.75 }}>
          <CustomHomeProviderMarquee />
        </Box>,
        slot.node,
        slot.id
      );
    }

    if (slot.type === 'api-terminal') {
      return createPortal(
        <Box data-aihub-native="api-terminal" sx={{ width: '100%' }}>
          <ApiTerminalDemo protocols={slot.protocols} />
        </Box>,
        slot.node,
        slot.id
      );
    }

    return null;
  });

  return (
    <>
      <Paper
        elevation={0}
        style={
          disablePadding
            ? {
                overflowX: 'hidden',
                overflowY: scrollContainer ? 'auto' : 'visible'
              }
            : undefined
        }
        sx={{
          overflowX: 'hidden',
          overflowY: disablePadding && scrollContainer ? 'auto' : 'visible',
          backgroundColor: 'transparent',
          borderRadius: disablePadding ? 0 : undefined,
          m: disablePadding ? 0 : undefined,
          p: disablePadding ? 0 : undefined,
          position: disablePadding && scrollContainer ? 'fixed' : undefined,
          inset: disablePadding && scrollContainer ? 0 : undefined,
          zIndex: disablePadding ? 0 : undefined,
          width: disablePadding ? '100%' : undefined,
          maxWidth: disablePadding ? '100vw' : undefined,
          boxSizing: 'border-box',
          '&::-webkit-scrollbar:horizontal': {
            height: '0 !important',
            display: 'none'
          },
          ...containerStyle
        }}
      >
        {isUrl ? (
          <iframe
            title="content-frame"
            src={parsedContent}
            sandbox={DEFAULT_IFRAME_SANDBOX}
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
            ref={contentRef}
            className="content-viewer"
            data-theme={resolvedTheme}
            data-language={language}
            sx={{
              fontSize: 'inherit',
              lineHeight: 1.6,
              p: useNativeLayout ? '0 !important' : disablePadding ? '0 !important' : undefined,
              m: disablePadding ? '0 !important' : undefined,
              width: useNativeLayout || disablePadding ? '100%' : undefined,
              maxWidth: useNativeLayout ? '100%' : disablePadding ? '100vw' : undefined,
              minHeight: disablePadding ? '100%' : undefined,
              boxSizing: 'border-box',
              overflowX: disablePadding ? 'hidden !important' : undefined,
              overflowY: disablePadding ? 'visible' : undefined,
              WebkitOverflowScrolling: disablePadding ? 'touch' : undefined,
              '&::-webkit-scrollbar:horizontal': {
                height: '0 !important',
                display: 'none'
              },
              '& img': {
                maxWidth: '100%',
                height: 'auto'
              },
              ...(disablePadding
                ? {
                    '& > iframe:only-child': {
                      display: 'block',
                      width: '100% !important',
                      maxWidth: '100% !important',
                      minHeight: autoResizeEmbeddedFrames ? '100% !important' : undefined,
                      height: autoResizeEmbeddedFrames ? undefined : '100% !important',
                      maxHeight: autoResizeEmbeddedFrames ? undefined : '100% !important',
                      border: '0 !important'
                    }
                  }
                : {}),
              ...(useNativeLayout ? customHomeNativeSx(theme) : {}),
              ...contentStyle
            }}
            dangerouslySetInnerHTML={{ __html: parsedContent }}
          />
        )}
      </Paper>
      {nativePortals}
    </>
  );
};

ContentViewer.propTypes = {
  content: PropTypes.string,
  loading: PropTypes.bool,
  errorMessage: PropTypes.string,
  containerStyle: PropTypes.object,
  contentStyle: PropTypes.object,
  disablePadding: PropTypes.bool,
  iframeHeight: PropTypes.string,
  autoResizeEmbeddedFrames: PropTypes.bool,
  scrollContainer: PropTypes.bool,
  enableScripts: PropTypes.bool
};

export default ContentViewer;
