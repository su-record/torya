#!/bin/bash
# Core collaborator auto-install script
# Usage: ./.vibe/setup.sh

set -e

echo "🔧 Checking Core installation..."

# Check npm/npx
if ! command -v npx &> /dev/null; then
    echo "❌ Node.js/npm is not installed."
    echo "   Please install from https://nodejs.org"
    exit 1
fi

# Check core installation and update
if command -v vibe &> /dev/null; then
    echo "✅ Core is already installed."
    vibe update --silent
    echo "✅ Core updated!"
else
    echo "📦 Installing Core..."
    npm install -g @su-record/vibe
    vibe update --silent
    echo "✅ Core installed and configured!"
fi

echo ""
echo "Get started with:"
echo "  /vibe.spec \"feature\"    Create SPEC"
echo "  /vibe.run \"feature\"     Implement"
