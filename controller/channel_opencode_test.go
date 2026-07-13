package controller

import (
	"done-hub/common/config"
	"done-hub/model"
	"reflect"
	"testing"
)

func TestChannelKeysForCreateKeepsOpenCodeJSONIntact(t *testing.T) {
	key := "{\n  \"api_key\": \"sk-test\",\n  \"auth_cookie\": \"auth=session\"\n}"
	got := channelKeysForCreate(model.Channel{Type: config.ChannelTypeOpenCode, Key: key})
	want := []string{key}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("channelKeysForCreate() = %#v, want %#v", got, want)
	}
}

func TestChannelKeysForCreatePreservesBatchBehavior(t *testing.T) {
	got := channelKeysForCreate(model.Channel{Type: config.ChannelTypeOpenAI, Key: "key-1\nkey-2"})
	want := []string{"key-1", "key-2"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("channelKeysForCreate() = %#v, want %#v", got, want)
	}
}
