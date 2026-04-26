package agents

import "os"

func homeDir() (string, error) {
	if h, err := os.UserHomeDir(); err == nil {
		return h, nil
	}
	return "", os.ErrNotExist
}
