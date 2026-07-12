package common

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
	"strings"

	"github.com/spf13/viper"
)

const encryptedSecretPrefix = "enc:v1:"

func EncryptSecret(plaintext, purpose string) (string, error) {
	key, err := secretEnvelopeKey(purpose)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, []byte(plaintext), []byte(purpose))
	return encryptedSecretPrefix + base64.RawURLEncoding.EncodeToString(sealed), nil
}

func DecryptSecret(value, purpose string) (string, error) {
	if !strings.HasPrefix(value, encryptedSecretPrefix) {
		return value, nil
	}
	key, err := secretEnvelopeKey(purpose)
	if err != nil {
		return "", err
	}
	ciphertext, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(value, encryptedSecretPrefix))
	if err != nil {
		return "", errors.New("invalid encrypted secret")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(ciphertext) < gcm.NonceSize() {
		return "", errors.New("invalid encrypted secret")
	}
	nonce, ciphertext := ciphertext[:gcm.NonceSize()], ciphertext[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, []byte(purpose))
	if err != nil {
		return "", errors.New("unable to decrypt secret")
	}
	return string(plaintext), nil
}

func secretEnvelopeKey(purpose string) ([]byte, error) {
	master := viper.GetString("user_token_secret")
	if master == "" {
		return nil, errors.New("user_token_secret is required to protect credentials")
	}
	sum := sha256.Sum256([]byte("done-hub/secret-envelope/v1/" + purpose + "/" + master))
	return sum[:], nil
}
