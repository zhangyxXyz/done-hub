package model

import "strings"

// Latest fallback is one-way. Platform-qualified names retain their prefix.
func GetLatestPriceAliases(modelName string) []string {
	if strings.HasSuffix(strings.ToLower(modelName), "-latest") {
		return nil
	}
	target := modelName + "-latest"
	aliases := []string{target}
	if !strings.Contains(modelName, "/") {
		for _, alias := range GetModelPriceAliases(target) {
			// Do not change paid/thinking variants while looking for a latest price.
			if strings.HasSuffix(alias, "-latest") {
				aliases = append(aliases, alias, "~"+alias)
			}
		}
	}
	return aliases
}
