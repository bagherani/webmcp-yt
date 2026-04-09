# agent-app

TypeScript CLI that opens a visible Chrome window through the DevTools MCP server, accepts the cookie banner when it appears, reads the page accessibility snapshot for the fixed bol.com product URL, then prints the product title and price as JSON.

## Setup

```bash
npm install
```

## Run

```bash
npm run dev
# or
npm run build && npm start
```

## Notes

- The app starts `chrome-devtools-mcp` directly with a visible browser.
- It uses an isolated browser profile so the temporary session is cleaned up when the run finishes.
- It extracts the product info from page content, not screenshots or model output.
