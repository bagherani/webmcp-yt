/**
 * Sample TypeScript app: MCP client + OpenAI.
 * Uses MCP servers from ~/.cursor/mcp.json and OpenAI-compatible API from env.
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import OpenAI from "openai";

const MCP_CONFIG_PATH = join(process.env.HOME ?? "", ".cursor", "mcp.json");

interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface McpJson {
  mcpServers?: Record<string, McpServerConfig>;
}

function loadMcpConfig(): McpJson {
  try {
    const raw = readFileSync(MCP_CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as McpJson;
  } catch (err) {
    console.error("Failed to load MCP config from", MCP_CONFIG_PATH, err);
    return {};
  }
}

async function connectServer(
  name: string,
  config: McpServerConfig
): Promise<{ client: Client; transport: StdioClientTransport } | null> {
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args ?? [],
    env: config.env,
  });
  const client = new Client(
    { name: "webmcp-sample", version: "0.1.0" },
    { capabilities: {} }
  );
  try {
    await client.connect(transport);
    return { client, transport };
  } catch (err) {
    console.error(`Failed to connect to MCP server "${name}":`, err);
    return null;
  }
}

async function main() {
  const config = loadMcpConfig();
  const servers = config.mcpServers ?? {};
  if (Object.keys(servers).length === 0) {
    console.log("No mcpServers found in", MCP_CONFIG_PATH);
    return;
  }

  const connections: Array<{
    name: string;
    client: Client;
    transport: StdioClientTransport;
  }> = [];

  for (const [name, serverConfig] of Object.entries(servers)) {
    // Use an isolated browser instance for chrome-devtools when run from this app,
    // so we don't conflict with an already-running browser (e.g. from Cursor).
    const config =
      name === "chrome-devtools"
        ? { ...serverConfig, args: [...(serverConfig.args ?? []), "--isolated"] }
        : serverConfig;
    const conn = await connectServer(name, config);
    if (conn) {
      connections.push({ name, ...conn });
      console.log(`Connected to MCP server: ${name}`);
    }
  }

  if (connections.length === 0) {
    console.log("No MCP servers could be connected.");
    return;
  }

  // List tools from each server
  const allToolsByServer: Array<{ name: string; tools: Awaited<ReturnType<Client["listTools"]>>["tools"] }> = [];
  for (const { name, client } of connections) {
    const { tools } = await client.listTools();
    allToolsByServer.push({ name, tools });
    console.log(`\nTools from "${name}":`, tools.map((t) => t.name).join(", "));
  }

  // Demo: call "fetch" tool if available (from any server)
  const fetchServerIndex = allToolsByServer.findIndex((s) =>
    s.tools.some((t) => t.name === "fetch")
  );
  if (fetchServerIndex >= 0) {
    const conn = connections[fetchServerIndex];
    const result = await conn.client.callTool({
      name: "fetch",
      arguments: { url: "https://example.com", max_length: 500 },
    });
    const text =
      "content" in result &&
      Array.isArray(result.content) &&
      result.content[0]?.type === "text"
        ? result.content[0].text
        : JSON.stringify(result);
    console.log("\nFetch result (first 200 chars):", text.slice(0, 200) + "...");
  }

  // OpenAI client (custom base URL + API key from env)
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL;

  if (!apiKey) {
    console.log(
      "\nSet OPENAI_API_KEY (and optionally OPENAI_BASE_URL) in .env to use the LLM."
    );
  } else {
    const openai = new OpenAI({
      apiKey,
      baseURL: baseURL ?? undefined,
    });

    // Build OpenAI-format tools from MCP tools and a map: toolName -> client.
    // Exclude browser_eval (next-devtools) so the LLM uses chrome-devtools (navigate_page, fill, click)
    // instead of Playwright. Chrome DevTools MCP connects to your Chrome directly; no Playwright.
    const EXCLUDED_TOOLS = new Set(["browser_eval"]);
    type ToolEntry = (typeof allToolsByServer)[0]["tools"][0];
    const openaiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];
    const toolNameToClient = new Map<string, { client: Client; serverName: string }>();
    for (const { name: serverName, tools } of allToolsByServer) {
      for (const t of tools as ToolEntry[]) {
        if (EXCLUDED_TOOLS.has(t.name)) continue;
        openaiTools.push({
          type: "function",
          function: {
            name: t.name,
            description: t.description ?? undefined,
            parameters: t.inputSchema ?? { type: "object" },
          },
        });
        if (!toolNameToClient.has(t.name)) {
          const conn = connections.find((c) => c.name === serverName)!;
          toolNameToClient.set(t.name, { client: conn.client, serverName });
        }
      }
    }

    type Message = OpenAI.Chat.Completions.ChatCompletionMessageParam;
    const messages: Message[] = [
      {
        role: "system",
        content:
          "You are a helpful assistant. For opening web pages and interacting with sites, use the chrome-devtools tools: navigate_page (open a URL), list_pages, fill (type in inputs), click, etc. Use these tools—do not describe actions without calling them.",
      },
      {
        role: "user",
        content: `open bol.com, accept cookier banner,
          and search for 'iphone 17 pro max 256gb'
          and get its prices and return the cheapest one.`,
      },
    ];

    try {
      let completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        tools: openaiTools.length ? openaiTools : undefined,
        max_tokens: 1024,
      });

      const maxToolRounds = 15;
      let rounds = 0;

      while (rounds < maxToolRounds) {
        const choice = completion.choices[0];
        if (!choice?.message) break;

        const msg = choice.message;
        messages.push({
          role: "assistant",
          content: msg.content ?? null,
          tool_calls: msg.tool_calls as OpenAI.Chat.Completions.ChatCompletionMessage["tool_calls"],
        });

        const toolCalls = msg.tool_calls;
        if (!toolCalls?.length) {
          if (msg.content) console.log("\nLLM reply:", msg.content);
          break;
        }

        for (const tc of toolCalls) {
          const name = tc.function?.name;
          const args = (() => {
            try {
              return (tc.function?.arguments && JSON.parse(tc.function.arguments)) ?? {};
            } catch {
              return {};
            }
          })();
          const entry = name ? toolNameToClient.get(name) : undefined;
          if (!entry) {
            console.warn("\nUnknown tool:", name);
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify({ error: `Unknown tool: ${name}` }),
            });
            continue;
          }
          try {
            const result = await entry.client.callTool({ name: name!, arguments: args });
            const text =
              "content" in result &&
              Array.isArray(result.content) &&
              result.content[0]?.type === "text"
                ? result.content[0].text
                : JSON.stringify(result);
            console.log("\nTool", name, "->", text.slice(0, 200) + (text.length > 200 ? "..." : ""));
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: text,
            });
          } catch (err) {
            const errText = err instanceof Error ? err.message : String(err);
            console.warn("\nTool", name, "error:", errText);
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify({ error: errText }),
            });
          }
        }

        rounds++;
        completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          tools: openaiTools.length ? openaiTools : undefined,
          max_tokens: 1024,
        });
      }
    } catch (err) {
      console.error("OpenAI request failed:", err);
    }
  }

  // Cleanup
  for (const { client } of connections) {
    await client.close();
  }
}

main().catch(console.error);
