package controller

import (
	"bytes"
	"context"
	"crypto/rand"
	"done-hub/common"
	"done-hub/common/cache"
	"done-hub/model"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/net/proxy"
)

const (
	githubCopilotOAuthStatePrefix = "github_copilot_oauth_state:"
	githubCopilotDeviceCodeURL    = "https://github.com/login/device/code"
	githubCopilotAccessTokenURL   = "https://github.com/login/oauth/access_token"
	// GitHub Copilot Chat OAuth app. Ordinary user-created OAuth apps receive a
	// 404 from copilot_internal because they are not entitled for Copilot APIs.
	githubCopilotDefaultClientID = "Iv1.b507a08c87ecfe98"
)

type githubCopilotOAuthState struct {
	DeviceCode string `json:"device_code"`
	ClientID   string `json:"client_id"`
	Proxy      string `json:"proxy"`
	Interval   int    `json:"interval"`
	NextPollAt int64  `json:"next_poll_at"`
	ExpiresAt  int64  `json:"expires_at"`
	UserID     int    `json:"user_id"`
}

var githubCopilotOAuthStateLocks sync.Map

type githubCopilotDeviceResponse struct {
	DeviceCode      string `json:"device_code"`
	UserCode        string `json:"user_code"`
	VerificationURI string `json:"verification_uri"`
	ExpiresIn       int    `json:"expires_in"`
	Interval        int    `json:"interval"`
}

type githubCopilotTokenResponse struct {
	AccessToken      string `json:"access_token"`
	TokenType        string `json:"token_type"`
	Scope            string `json:"scope"`
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description"`
}

type StartGitHubCopilotOAuthRequest struct {
	ChannelID jsonInt `json:"channel_id"`
	ClientID  string  `json:"client_id"`
	Proxy     string  `json:"proxy"`
}

// StartGitHubCopilotOAuth starts GitHub's OAuth device flow. The OAuth App
// identified by GITHUB_COPILOT_CLIENT_ID must have Device Flow enabled.
func StartGitHubCopilotOAuth(c *gin.Context) {
	var input StartGitHubCopilotOAuthRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		common.APIRespondWithError(c, http.StatusOK, err)
		return
	}
	clientID := strings.TrimSpace(input.ClientID)
	if clientID == "" {
		clientID = strings.TrimSpace(os.Getenv("GITHUB_COPILOT_CLIENT_ID"))
	}
	if clientID == "" {
		clientID = githubCopilotDefaultClientID
	}
	proxyAddress := strings.TrimSpace(input.Proxy)
	if proxyAddress == "" && input.ChannelID.Int() > 0 {
		channel, err := model.GetChannelById(input.ChannelID.Int())
		if err != nil {
			common.APIRespondWithError(c, http.StatusOK, fmt.Errorf("读取渠道代理失败: %w", err))
			return
		}
		proxyAddress = channel.GetProxy()
	}

	form := url.Values{"client_id": {clientID}}
	var device githubCopilotDeviceResponse
	if err := githubCopilotOAuthPostForm(c.Request.Context(), githubCopilotDeviceCodeURL, form, proxyAddress, &device); err != nil {
		common.APIRespondWithError(c, http.StatusOK, fmt.Errorf("启动 GitHub Device OAuth 失败: %w", err))
		return
	}
	if device.DeviceCode == "" || device.UserCode == "" || device.VerificationURI == "" {
		common.APIRespondWithError(c, http.StatusOK, errors.New("GitHub Device OAuth 返回内容不完整"))
		return
	}
	if device.Interval < 1 {
		device.Interval = 5
	}
	if device.ExpiresIn < 1 {
		device.ExpiresIn = 900
	}

	stateBytes := make([]byte, 32)
	if _, err := rand.Read(stateBytes); err != nil {
		common.APIRespondWithError(c, http.StatusOK, err)
		return
	}
	state := base64.RawURLEncoding.EncodeToString(stateBytes)
	now := time.Now()
	stateData := githubCopilotOAuthState{
		DeviceCode: device.DeviceCode,
		ClientID:   clientID,
		Proxy:      proxyAddress,
		Interval:   device.Interval,
		NextPollAt: now.Unix(),
		ExpiresAt:  now.Add(time.Duration(device.ExpiresIn) * time.Second).Unix(),
		UserID:     c.GetInt("id"),
	}
	// Keep the record briefly after GitHub expiry so Status can report "expired".
	if err := cache.SetCache(githubCopilotOAuthStatePrefix+state, stateData, time.Duration(device.ExpiresIn)*time.Second+10*time.Minute); err != nil {
		common.APIRespondWithError(c, http.StatusOK, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":          true,
		"status":           "pending",
		"state":            state,
		"user_code":        device.UserCode,
		"verification_uri": device.VerificationURI,
		"expires_in":       device.ExpiresIn,
		"interval":         device.Interval,
	})
}

// GetGitHubCopilotOAuthStatus polls GitHub no faster than the interval returned
// by the device-code endpoint. On success, credentials can be assigned directly
// to Channel.Key.
func GetGitHubCopilotOAuthStatus(c *gin.Context) {
	stateID := strings.TrimSpace(c.Param("state"))
	if stateID == "" {
		common.APIRespondWithError(c, http.StatusOK, errors.New("state parameter is required"))
		return
	}
	cacheKey := githubCopilotOAuthStatePrefix + stateID
	lockValue, _ := githubCopilotOAuthStateLocks.LoadOrStore(stateID, &sync.Mutex{})
	stateLock := lockValue.(*sync.Mutex)
	stateLock.Lock()
	defer stateLock.Unlock()
	state, err := cache.GetCache[githubCopilotOAuthState](cacheKey)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "status": "expired", "message": "授权状态不存在或已过期，请重新开始"})
		return
	}
	if state.UserID == 0 || state.UserID != c.GetInt("id") {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "status": "denied", "message": "该授权会话不属于当前管理员"})
		return
	}
	now := time.Now().Unix()
	if now >= state.ExpiresAt {
		_ = cache.DeleteCache(cacheKey)
		c.JSON(http.StatusOK, gin.H{"success": false, "status": "expired", "message": "设备授权已过期，请重新开始"})
		return
	}
	if now < state.NextPollAt {
		c.JSON(http.StatusOK, gin.H{"success": true, "status": "pending", "retry_after": state.NextPollAt - now, "message": "等待 GitHub 授权"})
		return
	}

	// Persist the next allowed time before the network call to reduce duplicate
	// polling when several browser requests arrive together.
	state.NextPollAt = now + int64(state.Interval)
	_ = cache.SetCache(cacheKey, state, time.Until(time.Unix(state.ExpiresAt, 0))+10*time.Minute)
	form := url.Values{
		"client_id":   {state.ClientID},
		"device_code": {state.DeviceCode},
		"grant_type":  {"urn:ietf:params:oauth:grant-type:device_code"},
	}
	var token githubCopilotTokenResponse
	if err := githubCopilotOAuthPostForm(c.Request.Context(), githubCopilotAccessTokenURL, form, state.Proxy, &token); err != nil {
		common.APIRespondWithError(c, http.StatusOK, fmt.Errorf("轮询 GitHub Device OAuth 失败: %w", err))
		return
	}

	switch token.Error {
	case "authorization_pending":
		c.JSON(http.StatusOK, gin.H{"success": true, "status": "pending", "retry_after": state.Interval, "message": "等待 GitHub 授权"})
		return
	case "slow_down":
		state.Interval += 5
		state.NextPollAt = time.Now().Unix() + int64(state.Interval)
		_ = cache.SetCache(cacheKey, state, time.Until(time.Unix(state.ExpiresAt, 0))+10*time.Minute)
		c.JSON(http.StatusOK, gin.H{"success": true, "status": "pending", "retry_after": state.Interval, "message": "GitHub 要求降低轮询频率"})
		return
	case "access_denied":
		_ = cache.DeleteCache(cacheKey)
		c.JSON(http.StatusOK, gin.H{"success": false, "status": "denied", "message": "用户拒绝了 GitHub 授权"})
		return
	case "expired_token":
		_ = cache.DeleteCache(cacheKey)
		c.JSON(http.StatusOK, gin.H{"success": false, "status": "expired", "message": "设备授权已过期，请重新开始"})
		return
	case "":
		// success
	default:
		_ = cache.DeleteCache(cacheKey)
		message := token.ErrorDescription
		if message == "" {
			message = token.Error
		}
		c.JSON(http.StatusOK, gin.H{"success": false, "status": "failed", "message": message})
		return
	}
	if token.AccessToken == "" {
		common.APIRespondWithError(c, http.StatusOK, errors.New("GitHub 未返回 access_token"))
		return
	}
	if token.TokenType == "" {
		token.TokenType = "bearer"
	}
	encryptedToken, err := common.EncryptSecret(token.AccessToken, "github-copilot-oauth")
	if err != nil {
		common.APIRespondWithError(c, http.StatusOK, err)
		return
	}
	credentials, err := json.Marshal(gin.H{"access_token": encryptedToken, "token_type": token.TokenType, "scope": token.Scope})
	if err != nil {
		common.APIRespondWithError(c, http.StatusOK, err)
		return
	}
	_ = cache.DeleteCache(cacheKey)
	c.JSON(http.StatusOK, gin.H{
		"success":     true,
		"status":      "completed",
		"message":     "GitHub Copilot 授权成功",
		"credentials": string(credentials),
	})
}

func githubCopilotOAuthPostForm(ctx context.Context, endpoint string, form url.Values, proxyAddress string, output any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewBufferString(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "done-hub-github-copilot-oauth")
	client := &http.Client{Timeout: 15 * time.Second}
	if err := configureGitHubCopilotOAuthProxy(client, proxyAddress); err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("GitHub 返回 HTTP %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(output)
}

func configureGitHubCopilotOAuthProxy(client *http.Client, proxyAddress string) error {
	if strings.TrimSpace(proxyAddress) == "" {
		return nil
	}
	proxyURL, err := url.Parse(proxyAddress)
	if err != nil {
		return fmt.Errorf("代理地址无效: %w", err)
	}
	switch proxyURL.Scheme {
	case "http", "https":
		client.Transport = &http.Transport{Proxy: http.ProxyURL(proxyURL)}
	case "socks5", "socks5h":
		dialer, err := proxy.FromURL(proxyURL, proxy.Direct)
		if err != nil {
			return err
		}
		client.Transport = &http.Transport{DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			if contextDialer, ok := dialer.(proxy.ContextDialer); ok {
				return contextDialer.DialContext(ctx, network, address)
			}
			return dialer.Dial(network, address)
		}}
	default:
		return fmt.Errorf("不支持的代理协议: %s", proxyURL.Scheme)
	}
	return nil
}
