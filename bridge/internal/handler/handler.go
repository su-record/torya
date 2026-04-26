// Package handler dispatches Native Messaging requests to per-command handlers.
package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/su-record/torya/bridge/internal/agents"
	"github.com/su-record/torya/bridge/internal/log"
	"github.com/su-record/torya/bridge/internal/nm"
	"github.com/su-record/torya/bridge/internal/proto"
	"github.com/su-record/torya/bridge/internal/safefs"
	"github.com/su-record/torya/bridge/internal/terminal"
)

const Version = "0.1.0"

type Handler struct {
	w     *nm.Writer
	guard *safefs.Guard
}

func New(w *nm.Writer) *Handler {
	return &Handler{w: w, guard: safefs.New()}
}

func (h *Handler) Dispatch(req proto.Request) {
	switch req.Cmd {
	case "ping":
		h.ping(req)
	case "detect-agents":
		h.detectAgents(req)
	case "detect-project":
		h.detectProject(req)
	case "set-workspaces":
		h.setWorkspaces(req)
	case "run-agent":
		h.runAgent(req)
	case "open-terminal":
		h.openTerminal(req)
	case "pick-folder":
		h.pickFolder(req)
	case "read-file":
		h.readFile(req)
	case "write-file":
		h.writeFile(req)
	default:
		_ = h.w.Write(proto.Err(req.ID, "unknown_cmd", "unknown command: "+req.Cmd))
	}
}

func (h *Handler) ping(req proto.Request) {
	_ = h.w.Write(proto.OK(req.ID, map[string]string{
		"version": Version,
		"os":      runtime.GOOS,
		"arch":    runtime.GOARCH,
	}))
}

func (h *Handler) detectAgents(req proto.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	infos := agents.DetectAll(ctx)
	_ = h.w.Write(proto.OK(req.ID, infos))
}

type detectProjectArgs struct {
	Origin string `json:"origin"` // e.g. "http://localhost:5173"
	Port   int    `json:"port"`
}

func (h *Handler) detectProject(req proto.Request) {
	var a detectProjectArgs
	if err := json.Unmarshal(req.Args, &a); err != nil {
		_ = h.w.Write(proto.Err(req.ID, "bad_args", err.Error()))
		return
	}
	port := a.Port
	if port == 0 && a.Origin != "" {
		port = portFromOrigin(a.Origin)
	}
	if port == 0 {
		_ = h.w.Write(proto.Err(req.ID, "bad_args", "origin or port required"))
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	info, err := agents.DetectPort(ctx, port)
	if err != nil {
		_ = h.w.Write(proto.Err(req.ID, "not_found", err.Error()))
		return
	}
	_ = h.w.Write(proto.OK(req.ID, info))
}

func portFromOrigin(origin string) int {
	// Tolerate http://host:port and https://host:port
	s := origin
	if i := strings.Index(s, "://"); i >= 0 {
		s = s[i+3:]
	}
	if i := strings.Index(s, "/"); i >= 0 {
		s = s[:i]
	}
	if i := strings.LastIndex(s, ":"); i >= 0 {
		if p, err := strconv.Atoi(s[i+1:]); err == nil {
			return p
		}
	}
	// http defaults
	if strings.HasPrefix(origin, "https://") {
		return 443
	}
	if strings.HasPrefix(origin, "http://") {
		return 80
	}
	return 0
}

type setWorkspacesArgs struct {
	Workspaces []struct {
		ID       string `json:"id"`
		RootPath string `json:"rootPath"`
	} `json:"workspaces"`
}

func (h *Handler) setWorkspaces(req proto.Request) {
	var a setWorkspacesArgs
	if err := json.Unmarshal(req.Args, &a); err != nil {
		_ = h.w.Write(proto.Err(req.ID, "bad_args", err.Error()))
		return
	}
	roots := make([]string, 0, len(a.Workspaces))
	for _, w := range a.Workspaces {
		if w.RootPath != "" {
			roots = append(roots, w.RootPath)
		}
	}
	h.guard.SetRoots(roots)
	log.Infof("workspace roots updated: %d", len(roots))
	_ = h.w.Write(proto.OK(req.ID, map[string]int{"count": len(roots)}))
}

type runAgentArgs struct {
	Agent    string `json:"agent"`
	Prompt   string `json:"prompt"`
	Cwd      string `json:"cwd"`
	Terminal string `json:"terminal"` // "cmux" | "system" | "auto"
}

func (h *Handler) runAgent(req proto.Request) {
	var a runAgentArgs
	if err := json.Unmarshal(req.Args, &a); err != nil {
		_ = h.w.Write(proto.Err(req.ID, "bad_args", err.Error()))
		return
	}
	if err := h.guard.Check(a.Cwd); err != nil {
		_ = h.w.Write(proto.Err(req.ID, "cwd_not_allowed", err.Error()))
		return
	}

	start := time.Now()
	cmdLine := buildCommand(a.Agent, a.Prompt)
	via := ""

	switch a.Terminal {
	case "cmux":
		st := terminal.CheckCmux()
		if st.Available {
			h.runWithSpawner(req, "cmux", terminal.Cmux(), a.Cwd, cmdLine, start)
			return
		}
		// cmux selected but unusable — surface the reason to the extension
		// so the user can fix it (install CLI, start cmux app, etc.).
		_ = h.w.Write(proto.Progress(req.ID, map[string]string{
			"stage":      "fallback",
			"from":       "cmux",
			"to":         "system",
			"reason":     st.Reason,
			"foundBin":   st.Bin,
		}))
		via = "cmux-fallback"
	case "silent":
		h.runWithSpawner(req, "silent", terminal.Silent(), a.Cwd, cmdLine, start)
		return
	}

	if via == "" || via == "cmux-fallback" {
		h.runWithSpawner(req, "system", terminal.System(), a.Cwd, cmdLine, start)
	}
}

// runWithSpawner dispatches to a Spawner, reports spawn/started progress,
// and waits on the spawner's `done` channel before writing the final Exit
// frame. If the spawner can't observe completion (done == nil) the run is
// reported as untracked so the extension can render it as \"opened in <X>\"
// rather than claiming a result.
func (h *Handler) runWithSpawner(
	req proto.Request,
	via string,
	sp terminal.Spawner,
	cwd, cmdLine string,
	start time.Time,
) {
	_ = h.w.Write(proto.Progress(req.ID, map[string]string{
		"stage": "spawn",
		"via":   via,
	}))
	ch, done, err := sp.Run(cwd, cmdLine)
	if err != nil {
		_ = h.w.Write(proto.Err(req.ID, "spawn_failed", err.Error()))
		return
	}
	_ = h.w.Write(proto.Progress(req.ID, map[string]any{
		"stage":   "started",
		"channel": ch,
		"tracked": done != nil,
	}))
	if done == nil {
		_ = h.w.Write(proto.Exit(req.ID, 0, time.Since(start).Milliseconds()))
		return
	}
	exitCode, ok := <-done
	if !ok {
		exitCode = -1
	}
	_ = h.w.Write(proto.Exit(req.ID, exitCode, time.Since(start).Milliseconds()))
}

func buildCommand(agent, prompt string) string {
	q := shellEscape(prompt)
	switch agent {
	case "claude":
		// acceptEdits lets Torya-launched runs apply file edits without a
		// human-in-the-loop prompt (which `-p` mode can't surface anyway).
		return "claude --permission-mode acceptEdits -p " + q
	case "codex":
		return "codex exec " + q
	case "gemini":
		return "gemini -p " + q
	default:
		return agent + " " + q
	}
}

// shellEscape produces a single-quoted bash-safe string. Sufficient for *nix;
// Windows wt.exe / cmd /K command line is emitted differently in spawner.
func shellEscape(s string) string {
	out := "'"
	for _, r := range s {
		if r == '\'' {
			out += `'"'"'`
		} else {
			out += string(r)
		}
	}
	out += "'"
	return out
}

type openTerminalArgs struct {
	Cwd      string `json:"cwd"`
	Terminal string `json:"terminal"`
}

func (h *Handler) openTerminal(req proto.Request) {
	var a openTerminalArgs
	if err := json.Unmarshal(req.Args, &a); err != nil {
		_ = h.w.Write(proto.Err(req.ID, "bad_args", err.Error()))
		return
	}
	if err := h.guard.Check(a.Cwd); err != nil {
		_ = h.w.Write(proto.Err(req.ID, "cwd_not_allowed", err.Error()))
		return
	}
	ch, _, err := terminal.System().Run(a.Cwd, "echo Torya bridge — workspace ready")
	if err != nil {
		_ = h.w.Write(proto.Err(req.ID, "spawn_failed", err.Error()))
		return
	}
	_ = h.w.Write(proto.OK(req.ID, map[string]string{"via": ch}))
}

type pickFolderArgs struct {
	Title string `json:"title"`
}

func (h *Handler) pickFolder(req proto.Request) {
	var a pickFolderArgs
	_ = json.Unmarshal(req.Args, &a)
	path, err := pickFolderOS(a.Title)
	if err != nil {
		_ = h.w.Write(proto.Err(req.ID, "pick_failed", err.Error()))
		return
	}
	_ = h.w.Write(proto.OK(req.ID, map[string]string{"path": path}))
}

type readFileArgs struct {
	Path     string `json:"path"`
	MaxBytes int    `json:"maxBytes"`
}

func (h *Handler) readFile(req proto.Request) {
	var a readFileArgs
	if err := json.Unmarshal(req.Args, &a); err != nil {
		_ = h.w.Write(proto.Err(req.ID, "bad_args", err.Error()))
		return
	}
	if err := h.guard.Check(a.Path); err != nil {
		_ = h.w.Write(proto.Err(req.ID, "path_not_allowed", err.Error()))
		return
	}
	content, size, err := readFileLimited(a.Path, a.MaxBytes)
	if err != nil {
		_ = h.w.Write(proto.Err(req.ID, "read_failed", err.Error()))
		return
	}
	_ = h.w.Write(proto.OK(req.ID, map[string]any{
		"content":  content,
		"encoding": "utf-8",
		"size":     size,
	}))
}

type writeFileArgs struct {
	Path       string `json:"path"`
	Content    string `json:"content"`
	CreateDirs bool   `json:"createDirs"`
}

func (h *Handler) writeFile(req proto.Request) {
	var a writeFileArgs
	if err := json.Unmarshal(req.Args, &a); err != nil {
		_ = h.w.Write(proto.Err(req.ID, "bad_args", err.Error()))
		return
	}
	if err := h.guard.Check(a.Path); err != nil {
		_ = h.w.Write(proto.Err(req.ID, "path_not_allowed", err.Error()))
		return
	}
	n, err := writeFileBytes(a.Path, a.Content, a.CreateDirs)
	if err != nil {
		_ = h.w.Write(proto.Err(req.ID, "write_failed", err.Error()))
		return
	}
	_ = h.w.Write(proto.OK(req.ID, map[string]int{"bytesWritten": n}))
}

// pickFolderOS prompts the user. For MVP we implement macOS only; other OS
// callers receive a clear error and the extension can fall back to manual entry.
func pickFolderOS(title string) (string, error) {
	if runtime.GOOS != "darwin" {
		return "", fmt.Errorf("pick-folder unimplemented on %s", runtime.GOOS)
	}
	return pickFolderDarwin(title)
}
