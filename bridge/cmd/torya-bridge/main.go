package main

import (
	"errors"
	"fmt"
	"io"
	"os"

	"github.com/su-record/torya/bridge/internal/handler"
	"github.com/su-record/torya/bridge/internal/log"
	"github.com/su-record/torya/bridge/internal/nm"
)

func main() {
	// CLI subcommand: "ping" — quick smoke test for installer scripts.
	if len(os.Args) > 1 && os.Args[1] == "ping" {
		fmt.Printf("torya-bridge %s ok\n", handler.Version)
		return
	}

	log.Setup()
	log.Infof("bridge start v%s", handler.Version)

	r := nm.NewReader(os.Stdin)
	w := nm.NewWriter(os.Stdout)
	h := handler.New(w)

	for {
		req, err := r.Read()
		if err != nil {
			if errors.Is(err, io.EOF) {
				log.Infof("stdin closed; exit")
				return
			}
			log.Errorf("read: %v", err)
			return
		}
		go h.Dispatch(req)
	}
}
