package nm

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"testing"

	"github.com/su-record/torya/bridge/internal/proto"
)

func TestFrameRoundTrip(t *testing.T) {
	var buf bytes.Buffer
	w := NewWriter(&buf)
	resp := proto.OK("r1", map[string]string{"hello": "world"})
	if err := w.Write(resp); err != nil {
		t.Fatal(err)
	}

	r := NewReader(&buf)
	// Reader.Read decodes a Request, but our payload is a Response — we instead
	// decode manually to verify framing.
	var lenBuf [4]byte
	// re-prime buf for manual frame parse via fresh reader on copy
	raw := buf.Bytes()
	copy(lenBuf[:], raw[:4])
	n := binary.LittleEndian.Uint32(lenBuf[:])
	if int(n)+4 != len(raw) {
		t.Fatalf("frame length mismatch: header=%d total=%d", n, len(raw))
	}
	var got proto.Response
	if err := json.Unmarshal(raw[4:], &got); err != nil {
		t.Fatal(err)
	}
	if got.ID != "r1" || got.Kind != "ok" {
		t.Fatalf("unexpected response: %+v", got)
	}
	_ = r
}

func TestFrameReadRequest(t *testing.T) {
	body := []byte(`{"v":1,"id":"q1","cmd":"ping"}`)
	var buf bytes.Buffer
	var lenBuf [4]byte
	binary.LittleEndian.PutUint32(lenBuf[:], uint32(len(body)))
	buf.Write(lenBuf[:])
	buf.Write(body)

	r := NewReader(&buf)
	req, err := r.Read()
	if err != nil {
		t.Fatal(err)
	}
	if req.Cmd != "ping" || req.ID != "q1" {
		t.Fatalf("unexpected: %+v", req)
	}
}

func TestFrameRejectsHugeFrame(t *testing.T) {
	var buf bytes.Buffer
	var lenBuf [4]byte
	binary.LittleEndian.PutUint32(lenBuf[:], MaxReadBytes+1)
	buf.Write(lenBuf[:])
	r := NewReader(&buf)
	if _, err := r.Read(); err == nil {
		t.Fatal("expected error on oversize frame")
	}
}
