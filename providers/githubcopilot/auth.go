package githubcopilot

import (
	"done-hub/common"
	"encoding/json"
	"errors"
	"strings"
)

type credential struct {
	AccessToken string `json:"access_token"`
}

func parseOAuthToken(key string) (string, error) {
	key = strings.TrimSpace(key)
	if key == "" {
		return "", errors.New("github copilot OAuth token is empty")
	}
	if !strings.HasPrefix(key, "{") {
		key = strings.TrimSpace(key)
	} else {
		var c credential
		if err := json.Unmarshal([]byte(key), &c); err != nil {
			return "", errors.New("invalid GitHub Copilot credential JSON")
		}
		key = strings.TrimSpace(c.AccessToken)
	}
	if key == "" {
		return "", errors.New("credential JSON does not contain access_token")
	}
	accessToken, err := common.DecryptSecret(key, "github-copilot-oauth")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(accessToken), nil
}
