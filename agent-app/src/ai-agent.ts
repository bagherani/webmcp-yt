import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

import { getOpenAI, OPENAI_MODEL } from "./openai-client.js";

type JsonSchema = Record<string, unknown>;

export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
};

const BROWSER_TOOL_NAMES = new Set([
  "new_page",
  "click",
  "fill",
  "press_key",
  "wait_for",
  "take_snapshot",
]);

const MAX_TOOL_ROUNDS = 32;
const MAX_TOOL_RESULT_CHARS = 50_000;

type Message = ChatCompletionMessageParam;

export type BrowserAgentTask = {
  searchUrl: string;
  ownedVacuum: string;
  searchQuery: string;
};

function normalizeSchema(schema: unknown, toolName: string): JsonSchema {
  if (schema && typeof schema === "object" && !Array.isArray(schema)) {
    return schema as JsonSchema;
  }

  console.warn(`Tool "${toolName}" has no object schema; using an empty object schema.`);
  return { type: "object", properties: {} };
}

export function toOpenAiTools(mcpTools: McpTool[]): ChatCompletionTool[] {
  return mcpTools
    .filter((tool) => BROWSER_TOOL_NAMES.has(tool.name))
    .filter((tool) => /^[A-Za-z0-9_-]{1,64}$/.test(tool.name))
    .map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description:
          tool.description ??
          `Call the browser DevTools MCP tool "${tool.name}".`,
        parameters: normalizeSchema(tool.inputSchema, tool.name),
      },
    }));
}

function truncateToolResult(text: string): string {
  if (text.length <= MAX_TOOL_RESULT_CHARS) {
    return text;
  }

  return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n\n[... tool output truncated ...]`;
}

export async function runBrowserAgent(
  callTool: (toolName: string, args: unknown) => Promise<string>,
  mcpTools: McpTool[],
  task: BrowserAgentTask
): Promise<void> {
  const openai = getOpenAI();
  const tools = toOpenAiTools(mcpTools);

  if (tools.length === 0) {
    throw new Error("No browser DevTools MCP tools were available for the AI agent.");
  }

  const messages: Message[] = [
    {
      role: "system",
      content: [
        "You control a real browser on miele.nl through DevTools MCP tools.",
        "Always call take_snapshot after navigation or clicks to see updated element uids.",
        "Use click/fill/press_key with uids from the latest snapshot only.",
        "Cookie banners are dismissed automatically — do not spend steps on cookies.",
        "Complete the user task step by step, then stop calling tools and reply with a short confirmation.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Context: the user already owns a "${task.ownedVacuum}" vacuum cleaner.`,
        `The search page (${task.searchUrl}) may already be open with cookies accepted.`,
        `1. If not on the search page yet, open ${task.searchUrl}.`,
        `2. Search for "${task.searchQuery}" and submit (Enter is fine).`,
        "3. Open the vacuum detail page that best matches the full name (including Nordic Blue).",
        "4. On that page, find a compatible dust bag (accessories, related products, zakken).",
        "5. Open the bag product page if it is a separate link.",
        "6. Stop when the bag detail page shows its price.",
        "Do not extract prices yourself — navigation only.",
      ].join("\n"),
    },
  ];

  let completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages,
    tools,
    max_tokens: 1024,
  });

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const message = completion.choices[0]?.message;

    if (!message) {
      break;
    }

    messages.push({
      role: "assistant",
      content: message.content ?? null,
      tool_calls: message.tool_calls,
    });

    if (!message.tool_calls?.length) {
      if (message.content) {
        console.log(`\n${message.content}`);
      }
      return;
    }

    for (const toolCall of message.tool_calls) {
      const toolName = toolCall.function.name;
      let parsedArgs: unknown = {};

      try {
        parsedArgs = JSON.parse(toolCall.function.arguments ?? "{}") as unknown;
      } catch {
        parsedArgs = toolCall.function.arguments ?? {};
      }

      try {
        const resultText = truncateToolResult(
          await callTool(toolName, parsedArgs)
        );

        console.log(
          `\nTool ${toolName} -> ${resultText.slice(0, 240)}${resultText.length > 240 ? "..." : ""}`
        );

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: resultText,
        });
      } catch (error) {
        const errorText = error instanceof Error ? error.message : String(error);
        console.warn(`\nTool ${toolName} error: ${errorText}`);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: errorText }),
        });
      }
    }

    completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      tools,
      max_tokens: 1024,
    });
  }

  throw new Error("The browser agent stopped after reaching the maximum number of tool rounds.");
}
