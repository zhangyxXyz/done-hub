package common

import (
	"bytes"
	"crypto/hmac"
	cryptoRand "crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"hash"
	"sync"

	"github.com/spf13/viper"
	"github.com/sqids/sqids-go"
)

const tokenPayloadChars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

var (
	hashidsMinLength = 15
	hashids          *sqids.Sqids

	jwtSecretBytes = []byte{}
	hmacPool       = sync.Pool{
		New: func() interface{} {
			return hmac.New(sha256.New, jwtSecretBytes)
		},
	}
)

func InitUserToken() error {
	tokenSecret := viper.GetString("user_token_secret")
	sqidsAlphabet := viper.GetString("hashids_salt")

	if tokenSecret == "" {
		return errors.New("token_secret or hashids_salt is not set")
	}

	var err error

	sqidsOptions := sqids.Options{
		MinLength: uint8(hashidsMinLength),
	}

	if sqidsAlphabet != "" {
		sqidsOptions.Alphabet = sqidsAlphabet
	}

	hashids, err = sqids.New(sqidsOptions)

	jwtSecretBytes = []byte(tokenSecret)

	return err
}

func signTokenPayload(payload string) string {
	h := hmacPool.Get().(hash.Hash)
	defer func() {
		h.Reset()
		hmacPool.Put(h)
	}()

	h.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(h.Sum(nil))
}

func GenerateToken(tokenID, userID int) (string, error) {
	payload, err := hashids.Encode([]uint64{uint64(tokenID), uint64(userID)})
	if err != nil {
		return "", err
	}

	signature := signTokenPayload(payload)

	return payload + "_" + signature, nil
}

func GenerateRandomToken() (string, error) {
	payload := make([]byte, hashidsMinLength)
	randomBytes := make([]byte, hashidsMinLength)
	if _, err := cryptoRand.Read(randomBytes); err != nil {
		return "", err
	}
	for i, randomByte := range randomBytes {
		payload[i] = tokenPayloadChars[int(randomByte)%len(tokenPayloadChars)]
	}

	payloadString := string(payload)
	signature := signTokenPayload(payloadString)

	return payloadString + "_" + signature, nil
}

func ValidateToken(token string) (tokenID, userID int, err error) {
	parts := bytes.SplitN([]byte(token), []byte("_"), 2)
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("无效的令牌")
	}

	payloadEncoded, receivedSignature := parts[0], parts[1]

	h := hmacPool.Get().(hash.Hash)
	defer func() {
		h.Reset()
		hmacPool.Put(h)
	}()

	h.Write(payloadEncoded)
	expectedSignature := h.Sum(nil)

	decodedSignature, err := base64.RawURLEncoding.DecodeString(string(receivedSignature))
	if err != nil {
		return 0, 0, fmt.Errorf("签名解码失败")
	}

	if !bytes.Equal(decodedSignature, expectedSignature) {
		return 0, 0, fmt.Errorf("签名验证失败")
	}

	numbers := hashids.Decode(string(payloadEncoded))
	if len(numbers) != 2 {
		return 0, 0, fmt.Errorf("无效的令牌")
	}

	return int(numbers[0]), int(numbers[1]), nil
}
