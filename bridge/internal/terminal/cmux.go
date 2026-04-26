package terminal

import (
	"net"
	"time"
)

// CmuxAvailable returns true if a local cmux RPC endpoint is reachable.
// Real RPC integration is filed for Phase 6 once we confirm the cmux protocol
// against the running build.
func CmuxAvailable() bool {
	c, err := net.DialTimeout("tcp", "127.0.0.1:7878", 250*time.Millisecond)
	if err != nil {
		return false
	}
	_ = c.Close()
	return true
}
