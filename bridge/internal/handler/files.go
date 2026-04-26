package handler

import (
	"errors"
	"io"
	"os"
	"path/filepath"
)

func readFileLimited(path string, maxBytes int) (string, int64, error) {
	if maxBytes <= 0 {
		maxBytes = 512 * 1024
	}
	f, err := os.Open(path)
	if err != nil {
		return "", 0, err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return "", 0, err
	}
	if st.Size() > int64(maxBytes) {
		return "", st.Size(), errors.New("file exceeds maxBytes")
	}
	b, err := io.ReadAll(f)
	if err != nil {
		return "", st.Size(), err
	}
	return string(b), st.Size(), nil
}

func writeFileBytes(path, content string, createDirs bool) (int, error) {
	if createDirs {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return 0, err
		}
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		return 0, err
	}
	defer f.Close()
	return f.Write([]byte(content))
}
