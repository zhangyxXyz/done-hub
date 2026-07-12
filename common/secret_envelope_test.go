package common

import (
	"strings"
	"testing"

	"github.com/spf13/viper"
)

func TestSecretEnvelopeRoundTripAndPurposeBinding(t *testing.T) {
	viper.Set("user_token_secret", "test-only-secret")
	t.Cleanup(func() { viper.Set("user_token_secret", "") })

	encrypted, err := EncryptSecret("gho_sensitive", "github-copilot-oauth")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(encrypted, encryptedSecretPrefix) || strings.Contains(encrypted, "gho_sensitive") {
		t.Fatalf("secret was not encrypted: %q", encrypted)
	}
	decrypted, err := DecryptSecret(encrypted, "github-copilot-oauth")
	if err != nil || decrypted != "gho_sensitive" {
		t.Fatalf("round trip = %q, %v", decrypted, err)
	}
	if _, err := DecryptSecret(encrypted, "different-purpose"); err == nil {
		t.Fatal("expected purpose-bound decryption to fail")
	}
}
