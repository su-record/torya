// Package terminal launches an OS terminal at a given cwd and runs an inline
// command. cmux RPC is preferred when available.
package terminal

type Spawner interface {
	// Run opens a terminal at cwd and starts cmd (already a single shell-line).
	// Returns the resolved channel name (e.g. "iterm", "wt", "gnome-terminal")
	// and an optional `done` channel that emits the exit code when the agent
	// finishes. A nil `done` means the OS surface can't surface completion
	// to us (legacy linux/windows path).
	Run(cwd, cmd string) (channel string, done <-chan int, err error)
}

// System returns the OS-specific spawner (defined per-build-tag in *_<os>.go).
func System() Spawner { return newSystem() }
