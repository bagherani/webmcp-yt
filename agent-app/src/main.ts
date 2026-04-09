import "dotenv/config";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import chalk from "chalk";
import { z } from "zod";

const PRODUCT_URL =
  "https://www.bol.com/nl/nl/p/sony-playstation-5-pro/9300000189666732";
const COOKIE_ACCEPT_TEXTS = [
  "accepteren",
  "alles accepteren",
  "accepteer",
  "accepteer alle",
  "accept",
  "accept all",
  "allow all",
  "akkoord",
  "agree",
  "i agree",
  "oke",
  "ok",
];
const COOKIE_BANNER_ACCEPT_DELAY_MS = 5000;

const ProductInfoSchema = z.object({
  title: z.string(),
  price: z.string(),
});

type ProductInfo = z.infer<typeof ProductInfoSchema>;

type JsonSchema = {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
};

type McpTool = {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
};

function logStep(message: string): void {
  console.log(`${chalk.cyanBright("->")} ${chalk.cyan(message)}`);
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function printProductInfo(product: ProductInfo): void {
  const line = chalk.blueBright("=".repeat(56));

  console.log("");
  console.log(line);
  console.log(chalk.bold.whiteBright(" Product Summary "));
  console.log(line);
  console.log(`${chalk.bold.cyan("Title:")} ${chalk.white(product.title)}`);
  console.log(`${chalk.bold.cyan("Price:")} ${chalk.greenBright.bold(product.price)}`);
  console.log("");
  console.log(chalk.dim("Raw JSON"));
  console.log(chalk.gray(JSON.stringify(product, null, 2)));
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

async function openProductPage(client: Client): Promise<void> {
  await callTool(client, "new_page", { url: PRODUCT_URL });
}

function findSnapshotButton(snapshotText: string): { uid: string; label: string } | null {
  const buttonPattern = /uid=([^\s]+)\s+button\s+"([^"]+)"/g;
  let match: RegExpExecArray | null;

  while ((match = buttonPattern.exec(snapshotText)) !== null) {
    const [, uid, label] = match;
    const normalizedLabel = normalizeText(label);

    if (
      COOKIE_ACCEPT_TEXTS.some(
        (candidate) =>
          normalizedLabel === normalizeText(candidate) ||
          normalizedLabel.includes(normalizeText(candidate))
      )
    ) {
      return { uid, label };
    }
  }

  return null;
}

async function dismissCookieBanner(client: Client): Promise<boolean> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const snapshotText = await callTool(client, "take_snapshot", {});
    const matchingButton = findSnapshotButton(snapshotText);

    if (matchingButton) {
      await callTool(client, "click", { uid: matchingButton.uid });
      logStep(`Accepted the cookie banner via "${matchingButton.label}".`);
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  logStep("No cookie banner acceptance button was found in the page snapshot.");
  return false;
}

function extractTitleFromSnapshot(snapshotText: string): string | null {
  const headingMatch = snapshotText.match(/heading "([^"]+)" level="1"/);

  if (headingMatch) {
    return headingMatch[1];
  }

  const rootTitleMatch = snapshotText.match(/RootWebArea "([^"]+?) \| bol"/);
  return rootTitleMatch?.[1] ?? null;
}

function formatDutchPrice(text: string): string {
  const priceMatch = text.match(/(\d+)\s+euro(?:\s+en\s+(\d+)\s+cent)?/i);

  if (!priceMatch) {
    return text.trim();
  }

  const euros = Number(priceMatch[1]);
  const cents = Number(priceMatch[2] ?? 0);
  const amount = euros + cents / 100;

  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

function extractPriceFromSnapshot(snapshotText: string): string | null {
  const buyBlockMatch = snapshotText.match(
    /heading "Prijsinformatie en bestellen" level="2"([\s\S]*?)(?:\n\s+uid=.*heading "|$)/
  );
  const priceSentenceMatch =
    buyBlockMatch?.[1].match(/StaticText "De prijs van dit product is ([^"]+)"/) ??
    snapshotText.match(/StaticText "De prijs van dit product is ([^"]+)"/);

  if (!priceSentenceMatch) {
    return null;
  }

  return formatDutchPrice(priceSentenceMatch[1]);
}

function extractProductInfoFromSnapshot(snapshotText: string): ProductInfo | null {
  const title = extractTitleFromSnapshot(snapshotText);
  const price = extractPriceFromSnapshot(snapshotText);

  if (!title || !price) {
    return null;
  }

  return ProductInfoSchema.parse({ title, price });
}

async function extractProductInfo(client: Client): Promise<ProductInfo> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const snapshotText = await callTool(client, "take_snapshot", {});
    const productInfo = extractProductInfoFromSnapshot(snapshotText);

    if (productInfo) {
      return productInfo;
    }

    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  throw new Error("Could not extract the product title and price from the page content.");
}

async function main() {
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
    const mcpTools = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: normalizeSchema(tool.inputSchema),
    }));

    if (!mcpTools.some((tool) => tool.name === "new_page")) {
      throw new Error('The DevTools MCP server did not expose the "new_page" tool.');
    }

    logStep(`Loaded ${mcpTools.length} MCP tool(s).`);
    logStep("Opening the product page...");
    await openProductPage(client);
    if (
      mcpTools.some((tool) => tool.name === "take_snapshot") &&
      mcpTools.some((tool) => tool.name === "click")
    ) {
      logStep(
        `Waiting ${COOKIE_BANNER_ACCEPT_DELAY_MS / 1000} seconds before accepting the cookie banner...`
      );
      await new Promise((resolve) =>
        setTimeout(resolve, COOKIE_BANNER_ACCEPT_DELAY_MS)
      );
      logStep("Checking for a cookie banner...");
      await dismissCookieBanner(client);
    }
    logStep("Extracting product details...");
    const productInfo = await extractProductInfo(client);
    printProductInfo(productInfo);
  } finally {
    await transport.close().catch(() => undefined);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${chalk.redBright("Error:")} ${chalk.red(message)}`);
  process.exitCode = 1;
});
