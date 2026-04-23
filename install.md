# Install

## Requirements

- [Bun](https://bun.sh) — `curl -fsSL https://bun.sh/install | bash`

## Setup

```bash
git clone https://github.com/hetpatel-11/tool-use
cd tool-use
bun install
```

Add the CLI to your path:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc  # or ~/.bashrc
source ~/.zshrc

mkdir -p ~/.local/bin
cat > ~/.local/bin/tool-use << EOF
#!/bin/sh
exec bun run "$(pwd)/run.ts" "\$@"
EOF
chmod +x ~/.local/bin/tool-use
```

## Verify

```bash
tool-use <<'TS'
const r = shell("echo hello from tool-use")
console.log(r.stdout)
TS
```

## Run tests

```bash
bun test
```
