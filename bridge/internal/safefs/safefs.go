// Package safefs constrains file operations to registered workspace roots.
package safefs

import (
	"errors"
	"path/filepath"
	"strings"
	"sync"
)

type Guard struct {
	mu    sync.RWMutex
	roots []string
}

func New() *Guard { return &Guard{} }

func (g *Guard) SetRoots(roots []string) {
	cleaned := make([]string, 0, len(roots))
	for _, r := range roots {
		abs, err := filepath.Abs(r)
		if err != nil {
			continue
		}
		cleaned = append(cleaned, filepath.Clean(abs))
	}
	g.mu.Lock()
	g.roots = cleaned
	g.mu.Unlock()
}

func (g *Guard) Roots() []string {
	g.mu.RLock()
	defer g.mu.RUnlock()
	out := make([]string, len(g.roots))
	copy(out, g.roots)
	return out
}

// Check returns nil if path resides under one of the registered roots.
func (g *Guard) Check(path string) error {
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	clean := filepath.Clean(abs)
	g.mu.RLock()
	defer g.mu.RUnlock()
	if len(g.roots) == 0 {
		return errors.New("no workspace roots registered")
	}
	for _, root := range g.roots {
		if clean == root || strings.HasPrefix(clean, root+string(filepath.Separator)) {
			return nil
		}
	}
	return errors.New("path is outside any workspace root")
}
