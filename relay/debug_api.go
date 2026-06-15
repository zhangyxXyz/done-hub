package relay

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type relayDebugToggleRequest struct {
	Enabled       bool `json:"enabled"`
	TTLMinutes    int  `json:"ttl_minutes"`
	FilterUserID  int  `json:"filter_user_id"`
	FilterTokenID int  `json:"filter_token_id"`
}

func GetRelayDebugIO(c *gin.Context) {
	limit := queryInt(c, "limit", relayDebugMaxEntries)
	if limit <= 0 || limit > relayDebugMaxEntries {
		limit = relayDebugMaxEntries
	}
	page := queryInt(c, "page", 1)
	if page <= 0 {
		page = 1
	}
	offset := queryInt(c, "offset", (page-1)*limit)
	if offset < 0 {
		offset = 0
	}

	knownNextID := queryInt64(c, "known_next_id", -1)
	knownCount := queryInt(c, "known_count", -1)
	state, entries, total, hasMore, changed := GetRelayDebugListIfChanged(offset, limit, knownNextID, knownCount)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"changed":  changed,
			"state":    state,
			"entries":  entries,
			"total":    total,
			"offset":   offset,
			"limit":    limit,
			"has_more": hasMore,
		},
	})
}

func GetRelayDebugIODetail(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "invalid debug entry id",
		})
		return
	}

	entry, ok := GetRelayDebugEntry(id)
	if !ok {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "debug entry not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    entry,
	})
}

func UpdateRelayDebugIO(c *gin.Context) {
	var request relayDebugToggleRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	state := SetRelayDebugEnabled(request.Enabled, request.TTLMinutes, request.FilterUserID, request.FilterTokenID)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    state,
	})
}

func queryInt(c *gin.Context, key string, fallback int) int {
	value := c.Query(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func queryInt64(c *gin.Context, key string, fallback int64) int64 {
	value := c.Query(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return fallback
	}
	return parsed
}

func ClearRelayDebugIO(c *gin.Context) {
	state := ClearRelayDebugEntries()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    state,
	})
}
