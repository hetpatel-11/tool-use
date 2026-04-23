# Install

## Requirements

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) (recommended) or pip

## Setup

```bash
# install globally so `agent-harness` is on $PATH
uv tool install .

# verify
agent-harness --help
```

Or without uv:
```bash
pip install -e .
```

## First run

```bash
agent-harness <<'PY'
r = shell("echo hello from agent-harness")
print(r["stdout"])
PY
```

## Environment variables

Copy `.env.example` to `.env` and fill in any keys your tasks need:

```bash
cp .env.example .env
```

Variables in `.env` are auto-loaded by helpers.py at runtime.

## Updating

```bash
git pull
uv tool install . --force
```
