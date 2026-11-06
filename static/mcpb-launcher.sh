#!/bin/sh
# Picks the server binary for this OS and CPU. Run as `sh launch.sh [args]`.
dir=$(dirname "$0")
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) bin=server_mac_arm64 ;;
  Darwin-x86_64) bin=server_mac_x64 ;;
  Linux-aarch64 | Linux-arm64) bin=server_linux_arm64 ;;
  Linux-x86_64) bin=server_linux_x64 ;;
  *) echo "unsupported platform: $(uname -s) $(uname -m)" >&2; exit 1 ;;
esac
exec "$dir/$bin" "$@"
