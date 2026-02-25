# webmcp

A monorepo for **MCP (Model Context Protocol)** experiments: a Next.js web app that exposes MCP tools in the browser, and a TypeScript CLI that connects to your MCP servers and drives them with an LLM.

## What’s in this repo

| Package    | Description |
|-----------|-------------|
| **[webmcp/](./webmcp)** | Next.js app with a sample MCP tool (e.g. name search). Use it in a Cursor-like environment that supports `navigator.modelContext` to register and call tools from the page. |
| **[mcp/](./mcp)**       | CLI that reads MCP servers from `~/.cursor/mcp.json`, connects to them via stdio, and runs an OpenAI-compatible LLM with those tools (e.g. browser automation via the chrome-devtools MCP server). |

## Quick start

- **Web app**: `cd webmcp && npm install && npm run dev` → [http://localhost:3000](http://localhost:3000)
- **MCP + LLM CLI**: see [mcp/README.md](./mcp/README.md) for setup (env, `~/.cursor/mcp.json`, chrome-devtools), then `cd mcp && npm install && npm run dev`

Each package has its own README with full setup and config.
