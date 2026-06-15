package router

import (
	"done-hub/controller"
	"done-hub/middleware"
	"embed"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"

	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

func newWebReverseProxy(target *url.URL) *httputil.ReverseProxy {
	proxy := httputil.NewSingleHostReverseProxy(target)
	director := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalHost := req.Host
		originalScheme := "http"
		if req.TLS != nil {
			originalScheme = "https"
		}
		if forwardedProto := req.Header.Get("X-Forwarded-Proto"); forwardedProto != "" {
			originalScheme = forwardedProto
		}

		director(req)
		req.Host = target.Host
		// Let the outer Gin gzip middleware be the only compression layer for
		// embedded chat apps. Mobile browsers commonly negotiate br/gzip here,
		// and double-compressed proxied pages can render as mojibake.
		req.Header.Del("Accept-Encoding")

		forwardedHost := originalHost
		if origin := req.Header.Get("Origin"); isLoopbackHost(originalHost) && origin != "" {
			if originURL, err := url.Parse(origin); err == nil && originURL.Host != "" {
				forwardedHost = originURL.Host
				if originURL.Scheme != "" {
					originalScheme = originURL.Scheme
				}
			}
		}

		req.Header.Set("X-Forwarded-Host", forwardedHost)
		req.Header.Set("X-Forwarded-Proto", originalScheme)
	}
	return proxy
}

func isLoopbackHost(host string) bool {
	hostname := host
	if parsedHost, _, err := net.SplitHostPort(host); err == nil {
		hostname = parsedHost
	}
	hostname = strings.Trim(hostname, "[]")
	return hostname == "localhost" || hostname == "127.0.0.1" || hostname == "::1"
}

func SetWebRouter(router *gin.Engine, buildFS embed.FS, indexPage []byte) {
	router.Use(gzip.Gzip(gzip.DefaultCompression))
	router.Use(middleware.GlobalWebRateLimit())

	// 特别处理favicon.ico请求，设置缓存
	router.GET("/favicon.ico", func(c *gin.Context) {
		c.Header("Cache-Control", "public, max-age=3600") // 1小时缓存
		controller.Favicon(buildFS)(c)
	})

	embedFS, err := static.EmbedFolder(buildFS, "web/build")
	if err != nil {
		// 处理错误，可以选择记录日志或者 panic
		panic("无法创建嵌入文件系统: " + err.Error())
	}
	router.Static("/uploads", "./uploads")

	nextChatURL := os.Getenv("NEXTCHAT_URL")
	if nextChatURL == "" {
		nextChatURL = "http://127.0.0.1:3001"
	}
	if target, err := url.Parse(nextChatURL); err == nil {
		nextChatProxy := newWebReverseProxy(target)
		nextChatHandler := func(c *gin.Context) {
			nextChatProxy.ServeHTTP(c.Writer, c.Request)
		}
		router.GET("/nextchat", middleware.UserAuth(), nextChatHandler)
		router.Any("/nextchat/*any", middleware.UserAuth(), nextChatHandler)
	}

	mjChatURL := os.Getenv("MJCHAT_URL")
	if mjChatURL == "" {
		mjChatURL = "http://127.0.0.1:3002"
	}
	if target, err := url.Parse(mjChatURL); err == nil {
		mjChatProxy := newWebReverseProxy(target)
		mjChatHandler := func(c *gin.Context) {
			mjChatProxy.ServeHTTP(c.Writer, c.Request)
		}
		router.GET("/mjchat", middleware.UserAuth(), mjChatHandler)
		router.Any("/mjchat/*any", middleware.UserAuth(), mjChatHandler)
	}

	router.Use(static.Serve("/", embedFS))

	router.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.RequestURI, "/v1") || strings.HasPrefix(c.Request.RequestURI, "/api") {
			controller.RelayNotFound(c)
			return
		}
		c.Header("Cache-Control", "no-cache")
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexPage)
	})
}
