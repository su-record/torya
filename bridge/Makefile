BIN := torya-bridge
DIST := dist
PLATFORMS := darwin/amd64 darwin/arm64 linux/amd64 linux/arm64 windows/amd64

.PHONY: build dev release clean test

build:
	mkdir -p $(DIST)
	go build -ldflags="-s -w" -o $(DIST)/$(BIN) ./cmd/torya-bridge

dev:
	go run ./cmd/torya-bridge

test:
	go test ./...

release:
	mkdir -p $(DIST)
	@for p in $(PLATFORMS); do \
	  os=$${p%/*}; arch=$${p#*/}; \
	  ext=""; [ "$$os" = "windows" ] && ext=".exe"; \
	  echo "→ $$os/$$arch"; \
	  GOOS=$$os GOARCH=$$arch go build -ldflags="-s -w" \
	    -o $(DIST)/$(BIN)-$$os-$$arch$$ext ./cmd/torya-bridge; \
	done

clean:
	rm -rf $(DIST)
