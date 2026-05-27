import "dotenv/config";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import chalk from "chalk";

import { runBrowserAgent, type McpTool } from "./ai-agent.js";
import { extractBagInfoWithPolling, type BagInfo } from "./ai-extract.js";
import {
  dismissCookieBanner,
  wrapCallToolWithCookieDismiss,
} from "./cookie-banner.js";

const SEARCH_URL = "https://www.miele.nl/search";
const OWNED_VACUUM = "Guard M1 Flex Nordic Blue";
const SEARCH_QUERY = OWNED_VACUUM;

type JsonSchema = {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
};

function logStep(message: string): void {
  console.log(`${chalk.cyanBright("->")} ${chalk.cyan(message)}`);
}

function printBagInfo(bag: BagInfo): void {
  const line = chalk.blueBright("=".repeat(56));

  console.log("");
  console.log(line);
  console.log(chalk.bold.whiteBright(` Compatible bag for ${OWNED_VACUUM} `));
  console.log(line);
  console.log(`${chalk.bold.cyan("Title:")} ${chalk.white(bag.title)}`);
  console.log(`${chalk.bold.cyan("Price:")} ${chalk.greenBright.bold(bag.price)}`);
  console.log(`${chalk.bold.cyan("Link:")} ${chalk.gray(bag.url)}`);
  console.log("");
  console.log(chalk.dim("Raw JSON"));
  console.log(chalk.gray(JSON.stringify(bag, null, 2)));
  console.log("");
}

function getSpawnEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries({
      ...process.env,
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: "1",
    }).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function normalizeSchema(schema: unknown): JsonSchema {
  if (schema && typeof schema === "object" && !Array.isArray(schema)) {
    return schema as JsonSchema;
  }

  return { type: "object", properties: {} };
}

function toolResultToText(result: unknown): string {
  if (!result || typeof result !== "object") {
    return JSON.stringify(result);
  }

  if (
    "structuredContent" in result &&
    result.structuredContent &&
    typeof result.structuredContent === "object"
  ) {
    return JSON.stringify(result.structuredContent);
  }

  if ("content" in result && Array.isArray(result.content)) {
    const text = result.content
      .map((item) => {
        if (!item || typeof item !== "object" || !("type" in item)) {
          return JSON.stringify(item);
        }

        if (item.type === "text" && "text" in item && typeof item.text === "string") {
          return item.text;
        }

        if (
          item.type === "resource" &&
          "resource" in item &&
          item.resource &&
          typeof item.resource === "object" &&
          "text" in item.resource &&
          typeof item.resource.text === "string"
        ) {
          return item.resource.text;
        }

        return JSON.stringify(item);
      })
      .join("\n")
      .trim();

    if (text) {
      return text;
    }
  }

  if ("toolResult" in result) {
    return JSON.stringify(result.toolResult);
  }

  return JSON.stringify(result);
}

async function callTool(
  client: Client,
  toolName: string,
  args: unknown
): Promise<string> {
  const normalizedArgs =
    args && typeof args === "object" && !Array.isArray(args)
      ? (args as Record<string, unknown>)
      : {};

  const result = await client.callTool({
    name: toolName,
    arguments: normalizedArgs,
  });

  return toolResultToText(result);
}

function isOpenAiAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /api key|authentication|unauthorized|401|invalid.*key/i.test(message);
}

async function main() {
  logStep(`Mission: find a dust bag for your ${OWNED_VACUUM}.`);

  const transport = new StdioClientTransport({
    command: "npx",
    args: [
      "-y",
      "chrome-devtools-mcp@latest",
      "--isolated=true",
      "--headless=false",
    ],
    env: getSpawnEnv(),
    stderr: "inherit",
  });
  const client = new Client({
    name: "agent-app",
    version: "0.1.0",
  });

  try {
    logStep("Connecting to the DevTools MCP server...");
    await client.connect(transport);

    const { tools } = await client.listTools();
    const mcpTools: McpTool[] = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: normalizeSchema(tool.inputSchema),
    }));

    logStep(`Loaded ${mcpTools.length} MCP tool(s).`);

    const callToolWithCookies = wrapCallToolWithCookieDismiss((name, args) =>
      callTool(client, name, args)
    );

    logStep("Opening the search page and dismissing the cookie banner...");
    await callTool(client, "new_page", { url: SEARCH_URL });
    await dismissCookieBanner((name, args) => callTool(client, name, args));

    logStep("Running the AI browser agent (search vacuum → open bag)...");
    await runBrowserAgent(callToolWithCookies, mcpTools, {
      searchUrl: SEARCH_URL,
      ownedVacuum: OWNED_VACUUM,
      searchQuery: SEARCH_QUERY,
    });

    logStep("Extracting bag title, price, and link with AI...");
    const bagInfo = await extractBagInfoWithPolling(
      () => callToolWithCookies("take_snapshot", {}),
      { ownedVacuum: OWNED_VACUUM }
    );

    printBagInfo(bagInfo);
  } finally {
    await transport.close().catch(() => undefined);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);

  if (isOpenAiAuthError(error)) {
    console.error(
      `${chalk.redBright("OpenAI error:")} ${chalk.red(message)}\n` +
        chalk.yellow("Check OPENAI_API_KEY and OPENAI_BASE_URL in agent-app/.env")
    );
  } else {
    console.error(`${chalk.redBright("Error:")} ${chalk.red(message)}`);
  }

  process.exitCode = 1;
});
