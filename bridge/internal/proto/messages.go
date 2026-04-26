package proto

import "encoding/json"

type Request struct {
	V    int             `json:"v"`
	ID   string          `json:"id"`
	Cmd  string          `json:"cmd"`
	Args json.RawMessage `json:"args,omitempty"`
}

type Response struct {
	V     int         `json:"v"`
	ID    string      `json:"id"`
	Kind  string      `json:"kind"` // ok | err | stdout | stderr | progress | exit
	Data  interface{} `json:"data,omitempty"`
	Error *ErrInfo    `json:"error,omitempty"`
}

type ErrInfo struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func OK(id string, data interface{}) Response {
	return Response{V: 1, ID: id, Kind: "ok", Data: data}
}

func Err(id, code, msg string) Response {
	return Response{V: 1, ID: id, Kind: "err", Error: &ErrInfo{Code: code, Message: msg}}
}

func Stdout(id, data string) Response {
	return Response{V: 1, ID: id, Kind: "stdout", Data: data}
}

func Progress(id string, data interface{}) Response {
	return Response{V: 1, ID: id, Kind: "progress", Data: data}
}

func Exit(id string, code int, durationMs int64) Response {
	return Response{V: 1, ID: id, Kind: "exit", Data: map[string]interface{}{
		"code":       code,
		"durationMs": durationMs,
	}}
}
