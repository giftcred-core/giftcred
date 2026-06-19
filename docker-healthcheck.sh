#!/bin/sh
port="${PORT:-8000}"
/usr/bin/wget -q --spider "http://127.0.0.1:${port}/api/live" 2>/dev/null || exit 1
