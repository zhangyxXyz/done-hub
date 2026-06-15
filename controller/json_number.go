package controller

import (
	"encoding/json"
	"strconv"
	"strings"
)

type jsonInt int

func (v *jsonInt) UnmarshalJSON(data []byte) error {
	raw := strings.TrimSpace(string(data))
	if raw == "" || raw == "null" {
		*v = 0
		return nil
	}

	var number int
	if err := json.Unmarshal(data, &number); err == nil {
		*v = jsonInt(number)
		return nil
	}

	var text string
	if err := json.Unmarshal(data, &text); err != nil {
		return err
	}
	if strings.TrimSpace(text) == "" {
		*v = 0
		return nil
	}
	parsed, err := strconv.Atoi(strings.TrimSpace(text))
	if err != nil {
		return err
	}
	*v = jsonInt(parsed)
	return nil
}

func (v jsonInt) Int() int {
	return int(v)
}
