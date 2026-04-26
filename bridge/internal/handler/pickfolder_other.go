//go:build !darwin

package handler

import "fmt"

func pickFolderDarwin(_ string) (string, error) {
	return "", fmt.Errorf("pick-folder darwin variant called on non-darwin build")
}
