BIN := torya-bridge
DIST := dist
PLATFORMS := darwin/amd64 darwin/arm64 linux/amd64 linux/arm64 windows/amd64

.PHONY: build dev release clean test install

INSTALL_DIR := $(HOME)/.local/bin

build:
	mkdir -p $(DIST)
	go build -ldflags="-s -w" -o $(DIST)/$(BIN) ./cmd/torya-bridge
	@# Auto-deploy to the path Chrome's NativeMessagingHost manifest points
	@# at, but only if the user has installed at least once. Without this,
	@# `make build` updated dist/ but Chrome kept running the old deployed
	@# binary, so flag/behavior changes silently no-op'd.
	@if [ -f $(INSTALL_DIR)/$(BIN) ]; then \
	  cp $(DIST)/$(BIN) $(INSTALL_DIR)/$(BIN); \
	  echo "→ deployed to $(INSTALL_DIR)/$(BIN)"; \
	fi

install: build
	mkdir -p $(INSTALL_DIR)
	cp $(DIST)/$(BIN) $(INSTALL_DIR)/$(BIN)
	@echo "→ installed to $(INSTALL_DIR)/$(BIN)"

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
