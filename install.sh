#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_DIR="$HOME/.claude/skills/sw-trace"

echo "Installing sw-trace to $TARGET_DIR ..."

# Remove old installation
rm -rf "$TARGET_DIR"

# Copy files
mkdir -p "$TARGET_DIR"
cp -r "$SCRIPT_DIR/src" "$TARGET_DIR/src"
cp -r "$SCRIPT_DIR/dist" "$TARGET_DIR/dist"
cp "$SCRIPT_DIR/package.json" "$TARGET_DIR/package.json"
cp "$SCRIPT_DIR/tsconfig.json" "$TARGET_DIR/tsconfig.json"
cp "$SCRIPT_DIR/SKILL.md" "$TARGET_DIR/SKILL.md"
cp "$SCRIPT_DIR/README.md" "$TARGET_DIR/README.md"

# Install dependencies and build
cd "$TARGET_DIR"
npm install --production 2>&1
npm run build 2>&1

echo ""
echo "sw-trace installed successfully."
echo "Run '/sw-trace config' in Claude Code to get started."
