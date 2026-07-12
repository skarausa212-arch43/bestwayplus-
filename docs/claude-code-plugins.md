# Claude Code plugins & MCP servers

This repo ships a curated Claude Code setup so everyone working on it (locally and
in Claude Code on the web) gets the same tooling. The configuration lives in two
committed files:

- `.claude/settings.json` — marketplaces and enabled plugins
- `.mcp.json` — MCP servers (Context7, Playwright)

## What's configured

| Tool | Type | Source | Purpose |
| --- | --- | --- | --- |
| **Frontend Design** | Plugin | `frontend-design@claude-plugins-official` | Removes the generic "AI-generated" look from UI work |
| **Security-guidance** | Plugin | `security-guidance@claude-plugins-official` | Reviews each change for vulnerabilities before prod |
| **Superpowers** | Plugin | `superpowers@superpowers-marketplace` (`obra/superpowers-marketplace`) | Structured dev process: brief → spec → plan → code |
| **Context7** | MCP server | `@upstash/context7-mcp` | Pulls current, version-accurate library docs into context |
| **Playwright** | MCP server | `@playwright/mcp` | Lets Claude drive a real browser to verify UI changes |

`.claude/settings.json` registers two marketplaces:

- `claude-plugins-official` (`anthropics/claude-plugins-official`) — Anthropic's
  official marketplace, home of Frontend Design and Security-guidance.
- `superpowers-marketplace` (`obra/superpowers-marketplace`) — home of Superpowers.

## How it activates

- **Plugins** (`enabledPlugins`): when you trust this repo folder, Claude Code
  prompts you to add the marketplaces and install the enabled plugins. Run
  `/plugin` to review, or accept the install prompt. After install, run
  `/reload-plugins`.
- **MCP servers** (`.mcp.json`): the two servers are pre-approved for this project
  via `enabledMcpjsonServers` in `.claude/settings.json`. In a freshly cloned /
  untrusted folder Claude Code still asks you to trust the workspace first; run
  `claude` in the repo and accept the trust dialog, then check `/mcp`. Both servers
  run via `npx`, so Node.js must be available on the machine.

## Manual install (equivalent commands)

If you'd rather set these up by hand instead of relying on the committed config:

```shell
# Official-marketplace plugins
/plugin install frontend-design@claude-plugins-official
/plugin install security-guidance@claude-plugins-official

# Superpowers (separate marketplace)
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace

# MCP servers
claude mcp add --transport stdio context7  -- npx -y @upstash/context7-mcp
claude mcp add --transport stdio playwright -- npx -y @playwright/mcp@latest
```

## Notes

- **Context7** can also run as a remote HTTP server at `https://mcp.context7.com/mcp`
  (pass `CONTEXT7_API_KEY` as a header for higher rate limits). The committed config
  uses the local `npx` server so no API key is required.
- **Playwright** downloads a browser on first use unless one is already present. In
  Claude Code on the web, Chromium is pre-installed.
