# webmcp

TypeScript sample app that uses the MCP client to connect to servers defined in `~/.cursor/mcp.json` and an OpenAI-compatible API for the LLM.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env: set OPENAI_API_KEY and optionally OPENAI_BASE_URL (e.g. your custom server)
```

## Run

```bash
npm run dev    # tsx src/main.ts
# or
npm run build && npm start
```

## Config

- **MCP servers**: Read from `~/.cursor/mcp.json` (same format as Cursor’s MCP config). The app spawns each server via stdio and lists/calls tools.

### Required: Chrome DevTools MCP server

This app expects the **chrome-devtools** MCP server to be configured so the LLM can control the browser (navigate, fill forms, click, etc.). Add it to your `~/.cursor/mcp.json`:

```json
"chrome-devtools": {
  "command": "npx",
  "args": ["-y", "chrome-devtools-mcp@latest"]
}
```

A full example config is in [mcp.json](./mcp.json)—you can copy it to `~/.cursor/mcp.json` or merge the `chrome-devtools` entry into your existing config.
- **LLM**: Uses `openai` package with:
  - `OPENAI_API_KEY` – required for LLM calls
  - `OPENAI_BASE_URL` – optional; use for a custom OpenAI-compatible endpoint

The sample lists tools from all connected MCP servers, optionally calls the `fetch` tool, and sends a short completion request to the LLM with the tools list in context.
