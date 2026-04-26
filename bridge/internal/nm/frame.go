// Package nm implements Chrome Native Messaging framing.
//
// Frame: [uint32 LE length][JSON bytes]
package nm

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sync"

	"github.com/su-record/torya/bridge/internal/proto"
)

// Max single-message size enforced by Chrome (1MB Chrome→host, 64KB host→Chrome
// historically — we cap reads at 4MB defensively, writes at 1MB).
const (
	MaxReadBytes  = 4 * 1024 * 1024
	MaxWriteBytes = 1 * 1024 * 1024
)

type Reader struct {
	r io.Reader
}

func NewReader(r io.Reader) *Reader { return &Reader{r: r} }

func (r *Reader) Read() (proto.Request, error) {
	var lenBuf [4]byte
	if _, err := io.ReadFull(r.r, lenBuf[:]); err != nil {
		return proto.Request{}, err
	}
	n := binary.LittleEndian.Uint32(lenBuf[:])
	if n == 0 || n > MaxReadBytes {
		return proto.Request{}, fmt.Errorf("frame size out of range: %d", n)
	}
	buf := make([]byte, n)
	if _, err := io.ReadFull(r.r, buf); err != nil {
		return proto.Request{}, err
	}
	var req proto.Request
	if err := json.Unmarshal(buf, &req); err != nil {
		return proto.Request{}, fmt.Errorf("decode: %w", err)
	}
	return req, nil
}

type Writer struct {
	w  io.Writer
	mu sync.Mutex
}

func NewWriter(w io.Writer) *Writer { return &Writer{w: w} }

func (w *Writer) Write(resp proto.Response) error {
	body, err := json.Marshal(resp)
	if err != nil {
		return fmt.Errorf("encode: %w", err)
	}
	if len(body) > MaxWriteBytes {
		return errors.New("response exceeds 1MB")
	}
	var lenBuf [4]byte
	binary.LittleEndian.PutUint32(lenBuf[:], uint32(len(body)))

	w.mu.Lock()
	defer w.mu.Unlock()
	if _, err := w.w.Write(lenBuf[:]); err != nil {
		return err
	}
	if _, err := w.w.Write(body); err != nil {
		return err
	}
	return nil
}
