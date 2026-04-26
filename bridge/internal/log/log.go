// Package log writes to a file. Stdout is reserved for Native Messaging.
package log

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"time"
)

var (
	mu  sync.Mutex
	out io.Writer = io.Discard
)

func Setup() {
	dir := cacheDir()
	if dir == "" {
		return
	}
	_ = os.MkdirAll(dir, 0o755)
	f, err := os.OpenFile(filepath.Join(dir, "bridge.log"),
		os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	mu.Lock()
	out = f
	mu.Unlock()
}

func Infof(format string, a ...any) { write("INFO ", format, a...) }
func Errorf(format string, a ...any) { write("ERROR", format, a...) }

func write(level, format string, a ...any) {
	mu.Lock()
	defer mu.Unlock()
	fmt.Fprintf(out, "%s %s %s\n",
		time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
		level,
		fmt.Sprintf(format, a...),
	)
}

func cacheDir() string {
	switch runtime.GOOS {
	case "darwin", "linux":
		if c, err := os.UserCacheDir(); err == nil {
			return filepath.Join(c, "torya")
		}
	case "windows":
		if a := os.Getenv("LOCALAPPDATA"); a != "" {
			return filepath.Join(a, "Torya")
		}
	}
	return ""
}
