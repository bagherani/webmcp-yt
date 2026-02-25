declare global {
  interface Navigator {
    modelContext?: {
      registerTool: (tool: object) => void;
      unregisterTool: (name: string) => void;
    };
  }
}

import { names } from "./db";

export function searchNames(query: string): string[] {
  const q = query.toLowerCase();
  return names.filter((name) => name.toLowerCase().includes(q));
}

function searchNamesToolExecute(args: { query: string }): string[] {
  const query = args.query;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("searchNames", { detail: { query: args.query } }));
  }
  return searchNames(query);
}

export const searchNamesTool = {
  execute: searchNamesToolExecute,
  name: "searchNames",
  description: "Search names by query. Returns names that contain the query (case-insensitive).",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query." },
    },
    required: ["query"],
  },
  outputSchema: {
    type: "object",
    properties: {
      result: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["result"],
  },
  annotations: { readOnlyHint: "true" },
};

export function registerSearchTools() {
  const modelContext = window.navigator.modelContext;
  if (modelContext) {
    modelContext.registerTool(searchNamesTool);
  }
}

export function unregisterSearchTools() {
  const modelContext = window.navigator.modelContext;
  if (modelContext) {
    modelContext.unregisterTool(searchNamesTool.name);
  }
}
