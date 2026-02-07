#!/usr/bin/env bash
set -euo pipefail

PORT=${PORT:-8000}

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
else
  echo "Не найден Python. Установите Python 3 с https://python.org."
  exit 1
fi

printf "Запуск локального сервера на http://localhost:%s\n" "$PORT"
"$PYTHON_BIN" -m http.server "$PORT"
