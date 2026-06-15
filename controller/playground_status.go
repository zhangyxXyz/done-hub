package controller

import (
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type playgroundServiceStatus struct {
	Key     string `json:"key"`
	Name    string `json:"name"`
	Version string `json:"version"`
	OK      bool   `json:"ok"`
}

func envWithDefault(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func normalizeBasePath(basePath string) string {
	if basePath == "" {
		return "/"
	}
	if !strings.HasPrefix(basePath, "/") {
		basePath = "/" + basePath
	}
	return basePath
}

func checkLocalWebService(baseURL string, basePath string) bool {
	client := http.Client{Timeout: 2 * time.Second}
	target := strings.TrimRight(baseURL, "/") + normalizeBasePath(basePath)
	resp, err := client.Get(target)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode >= http.StatusOK && resp.StatusCode < http.StatusInternalServerError
}

func GetPlaygroundStatus(c *gin.Context) {
	nextchatURL := envWithDefault("NEXTCHAT_URL", "http://127.0.0.1:3001")
	mjchatURL := envWithDefault("MJCHAT_URL", "http://127.0.0.1:3002")

	services := []playgroundServiceStatus{
		{
			Key:     "nextchat",
			Name:    "NextChat",
			Version: envWithDefault("NEXTCHAT_VERSION", "v2.16.1"),
			OK:      checkLocalWebService(nextchatURL, envWithDefault("NEXTCHAT_BASE_PATH", "/nextchat")),
		},
		{
			Key:     "mjchat",
			Name:    "MJChat",
			Version: envWithDefault("MJCHAT_VERSION", "v2.26.5"),
			OK:      checkLocalWebService(mjchatURL, envWithDefault("MJCHAT_BASE_PATH", "/mjchat/")),
		},
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"services": services,
		},
	})
}
