import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import OpenAI from "openai";
import { chromium, type Browser, type Page } from "playwright-core";

const APP_URL = process.env.WEBMCP_URL ?? "http://localhost:3000";
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const WEBMCP_CHROME_ARG = "--enable-experimental-web-platform-features";

type JsonSchema = Record<string, unknown>;

type PageToolDefinition = {
  name: string;
  description?: string;
  inputSchema?: JsonSchema | string;
  outputSchema?: JsonSchema | string;
  annotations?: Record<string, unknown>;
};

type WebMcpTestingApi = {
  listTools?: () => Promise<unknown> | unknown;
  executeTool?: (
    toolName: string,
    toolArgs: string | unknown
  ) => Promise<unknown> | unknown;
};

type WebMcpNavigator = Navigator & {
  modelContextTesting?: WebMcpTestingApi;
  modelContextTest?: WebMcpTestingApi;
};

type ChromeCandidate = {
  executablePath: string;
  version: string;
  majorVersion: number;
};

const CHROME_EXECUTABLE_CANDIDATES = [
  process.env.CHROME_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter((value): value is string => Boolean(value));

function getChromeCandidates(): ChromeCandidate[] {
  return CHROME_EXECUTABLE_CANDIDATES.filter((candidate) =>
    existsSync(candidate)
  )
    .map((executablePath) => {
      const versionOutput = execFileSync(executablePath, ["--version"], {
        encoding: "utf8",
      }).trim();
      const majorVersionMatch = versionOutput.match(/(\d+)\./);
      const majorVersion = Number(majorVersionMatch?.[1] ?? 0);

      return {
        executablePath,
        version: versionOutput,
        majorVersion,
      };
    })
    .sort((left, right) => right.majorVersion - left.majorVersion);
}

function getChromeExecutable(): ChromeCandidate {
  const candidates = getChromeCandidates();

  if (candidates.length === 0) {
    throw new Error(
      "Could not find a Chrome executable. Set CHROME_EXECUTABLE_PATH in .env if Chrome is installed somewhere else."
    );
  }

  const supportedCandidate = candidates.find(
    (candidate) => candidate.majorVersion >= 146
  );

  if (!supportedCandidate) {
    const installedVersions = candidates
      .map((candidate) => candidate.version)
      .join(", ");
    throw new Error(
      `WebMCP requires Chrome 146 or newer. Installed versions: ${installedVersions}`
    );
  }

  return supportedCandidate;
}

async function waitForWebMcpTestingApi(page: Page) {
  await page.waitForFunction(() => {
    const nav = navigator as WebMcpNavigator;

    return Boolean(
      nav.modelContextTesting?.listTools ?? nav.modelContextTest?.listTools
    );
  });
}

async function launchBrowser(): Promise<{ browser: Browser; page: Page }> {
  const chrome = getChromeExecutable();
  console.log(
    `Launching Chrome with WebMCP enabled: ${WEBMCP_CHROME_ARG}\nUsing: ${chrome.executablePath}\nVersion: ${chrome.version}`
  );

  const browser = await chromium.launch({
    executablePath: chrome.executablePath,
    headless: false,
    args: [WEBMCP_CHROME_ARG],
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await waitForWebMcpTestingApi(page);

  return { browser, page };
}

async function listPageTools(page: Page): Promise<PageToolDefinition[]> {
  const tools = await page.evaluate(async () => {
    const nav = navigator as WebMcpNavigator;
    const testingApi = nav.modelContextTesting ?? nav.modelContextTest;

    if (!testingApi?.listTools) {
      throw new Error("navigator.modelContextTesting.listTools is not available.");
    }

    return await testingApi.listTools();
  });

  if (!Array.isArray(tools)) {
    return [];
  }

  return (tools as PageToolDefinition[]).map((tool) => ({
    ...tool,
    inputSchema: normalizeSchema(tool.inputSchema, tool.name),
    outputSchema: normalizeSchema(tool.outputSchema, tool.name),
  }));
}

async function executePageTool(
  page: Page,
  name: string,
  args: unknown
): Promise<unknown> {
  const result = await page.evaluate(
    async ({ name, args }) => {
      const nav = navigator as WebMcpNavigator;
      const testingApi = nav.modelContextTesting ?? nav.modelContextTest;

      if (!testingApi?.executeTool) {
        throw new Error(
          "navigator.modelContextTesting.executeTool is not available."
        );
      }

      const serializedArgs =
        typeof args === "string" ? args : JSON.stringify(args ?? {});
      const rawResult = await testingApi.executeTool(name, serializedArgs);

      if (typeof rawResult !== "string") {
        return rawResult;
      }

      try {
        return JSON.parse(rawResult);
      } catch {
        return rawResult;
      }
    },
    { name, args }
  );

  await page.waitForTimeout(200);
  return result;
}

function toToolResultText(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }

  if (result === undefined) {
    return "null";
  }

  return JSON.stringify(result);
}

function normalizeSchema(
  schema: JsonSchema | string | undefined,
  toolName: string
): JsonSchema {
  if (!schema) {
    return { type: "object", properties: {} };
  }

  if (typeof schema === "string") {
    try {
      const parsed = JSON.parse(schema) as unknown;

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as JsonSchema;
      }
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      console.warn(
        `Could not parse input schema for tool "${toolName}": ${errorText}`
      );
    }

    console.warn(
      `Tool "${toolName}" exposed a string input schema. Falling back to an empty object schema.`
    );
    return { type: "object", properties: {} };
  }

  return schema;
}

function normalizeToolArguments(
  tool: PageToolDefinition | undefined,
  rawArgs: unknown
): unknown {
  const schema = normalizeSchema(tool?.inputSchema, tool?.name ?? "unknown");
  const properties =
    schema.properties && typeof schema.properties === "object"
      ? (schema.properties as Record<string, unknown>)
      : {};
  const propertyNames = Object.keys(properties);

  if (rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)) {
    return JSON.parse(JSON.stringify(rawArgs));
  }

  if (typeof rawArgs === "string" && propertyNames.length === 1) {
    return { [propertyNames[0]]: rawArgs };
  }

  return rawArgs;
}

function toOpenAiTools(
  pageTools: PageToolDefinition[]
): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return pageTools
    .filter((tool) => /^[A-Za-z0-9_-]{1,64}$/.test(tool.name))
    .map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description:
          tool.description ??
          `Call the ${tool.name} tool exposed by the current webpage.`,
        parameters: normalizeSchema(tool.inputSchema, tool.name),
      },
    }));
}

async function runAgent(page: Page, pageTools: PageToolDefinition[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL;

  if (!apiKey) {
    console.log(
      "\nOPENAI_API_KEY is not set, so I only opened the page and listed its WebMCP tools."
    );
    return;
  }

  const openai = new OpenAI({
    apiKey,
    baseURL: baseURL ?? undefined,
  });

  const tools = toOpenAiTools(pageTools);
  const toolByName = new Map(pageTools.map((tool) => [tool.name, tool]));
  type Message = OpenAI.Chat.Completions.ChatCompletionMessageParam;

  const messages: Message[] = [
    {
      role: "system",
      content:
        "You are helping with a local store app that is already open in Chrome. Use the page tools when they are useful. If you search for products, pick the best exact match for the user's request before adding it to the cart. Keep your final reply short, natural, and human.",
    },
    {
      role: "user",
      content:
        "The local store is already open. Please find the Trail Daypack and add it to the cart. Use the available page tools if that helps, then briefly tell me what you did.",
    },
  ];

  let completion = await openai.chat.completions.create({
    model: MODEL,
    messages,
    tools: tools.length ? tools : undefined,
    max_tokens: 1024,
  });

  const maxToolRounds = 10;
  let rounds = 0;

  while (rounds < maxToolRounds) {
    const message = completion.choices[0]?.message;

    if (!message) {
      break;
    }

    messages.push({
      role: "assistant",
      content: message.content ?? null,
      tool_calls:
        message.tool_calls as OpenAI.Chat.Completions.ChatCompletionMessage["tool_calls"],
    });

    if (!message.tool_calls?.length) {
      if (message.content) {
        console.log(`\nAgent: ${message.content}`);
      }
      return;
    }

    for (const toolCall of message.tool_calls) {
      const toolName = toolCall.function.name;
      const rawArgs = (() => {
        try {
          return JSON.parse(toolCall.function.arguments ?? "{}") as unknown;
        } catch {
          return toolCall.function.arguments ?? {};
        }
      })();
      const parsedArgs = normalizeToolArguments(
        toolByName.get(toolName),
        rawArgs
      );

      try {
        const result = await executePageTool(page, toolName, parsedArgs);
        const resultText = toToolResultText(result);

        console.log(
          `\nTool ${toolName} -> ${resultText.slice(0, 300)}${
            resultText.length > 300 ? "..." : ""
          }`
        );

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: resultText,
        });
      } catch (error) {
        const errorText =
          error instanceof Error ? error.message : String(error);

        console.warn(`\nTool ${toolName} error: ${errorText}`);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: errorText }),
        });
      }
    }

    rounds += 1;
    completion = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: tools.length ? tools : undefined,
      max_tokens: 1024,
    });
  }

  console.warn("\nStopped after reaching the maximum number of tool rounds.");
}

async function waitForBrowserClose(browser: Browser) {
  if (!browser.isConnected()) {
    return;
  }

  console.log("\nBrowser will stay open. Close the Chrome window to stop this app.");
  await new Promise<void>((resolve) => {
    browser.once("disconnected", () => resolve());
  });
}

async function main() {
  const { browser, page } = await launchBrowser();

  const pageTools = await listPageTools(page);
  console.log(
    "\nPage WebMCP tools:",
    pageTools.length
      ? pageTools.map((tool) => tool.name).join(", ")
      : "(none found)"
  );

  try {
    await runAgent(page, pageTools);
  } catch (error) {
    console.error("\nAgent run failed:", error);
  }

  await waitForBrowserClose(browser);
  console.log("Chrome was closed. Exiting.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
