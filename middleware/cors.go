package middleware

import (
	"done-hub/common/config"
	"net/url"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/spf13/viper"
)

func isAllowedCORSOrigin(origin string) bool {
	if origin == "" {
		return false
	}

	originURL, err := url.Parse(origin)
	if err != nil || originURL.Host == "" {
		return false
	}

	if originURL.Scheme != "http" && originURL.Scheme != "https" {
		return false
	}

	serverURL, err := url.Parse(config.ServerAddress)
	if err == nil && serverURL.Host != "" && strings.EqualFold(originURL.Host, serverURL.Host) && originURL.Scheme == serverURL.Scheme {
		return true
	}

	frontendURL, err := url.Parse(viper.GetString("frontend_base_url"))
	if err == nil && frontendURL.Host != "" && strings.EqualFold(originURL.Host, frontendURL.Host) && originURL.Scheme == frontendURL.Scheme {
		return true
	}

	host := strings.ToLower(originURL.Hostname())
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

func CORS() gin.HandlerFunc {
	config := cors.DefaultConfig()
	config.AllowOriginFunc = isAllowedCORSOrigin
	config.AllowCredentials = true
	config.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	config.AllowHeaders = []string{
		"Authorization",
		"Content-Type",
		"Accept",
		"Origin",
		"User-Agent",
		"Cache-Control",
		"X-Requested-With",
		"mj-api-secret",
		"x-api-key",
		"x-goog-api-key",
	}
	config.ExposeHeaders = []string{"Vary", "Cache-Control"}
	config.MaxAge = 12 * time.Hour
	return cors.New(config)
}
