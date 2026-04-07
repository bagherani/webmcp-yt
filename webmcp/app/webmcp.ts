import { products, type Product } from "./db";

type Tool<Input, Output> = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  execute: (args: Input) => Output | Promise<Output>;
};

type RegisteredTool = Pick<
  Tool<unknown, unknown>,
  "name" | "description" | "inputSchema" | "outputSchema" | "annotations"
>;

type NativeRegisteredTool = Omit<RegisteredTool, "inputSchema" | "outputSchema"> & {
  inputSchema?: Record<string, unknown> | string;
  outputSchema?: Record<string, unknown> | string;
};

type SearchProductsArgs = {
  query: string;
};

type AddToCartArgs = {
  productId: string;
  quantity?: number;
};

type ProductSearchResult = {
  id: string;
  name: string;
  category: string;
  price: number;
};

type SearchProductsResult = {
  query: string;
  resultCount: number;
  products: ProductSearchResult[];
};

type AddToCartResult = {
  added: {
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  };
  message: string;
};

declare global {
  interface Navigator {
    modelContext?: {
      registerTool: (
        tool: Tool<unknown, unknown>,
        options?: { signal?: AbortSignal }
      ) => void;
      unregisterTool?: (name: string) => void;
    };
    modelContextTesting?: {
      listTools?: () => Promise<RegisteredTool[]> | RegisteredTool[];
      executeTool?: (
        name: string,
        args: unknown
      ) => Promise<unknown> | unknown;
    };
  }
}

const PRODUCT_SEARCH_EVENT = "webmcp:search-products";
const ADD_TO_CART_EVENT = "webmcp:add-to-cart";

const registeredTools = new Map<string, Tool<unknown, unknown>>();
const toolControllers = new Map<string, AbortController>();

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function toProductSearchResult(product: Product): ProductSearchResult {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    price: product.price,
  };
}

export function searchProducts(query: string): Product[] {
  const normalizedQuery = normalizeQuery(query);

  if (!normalizedQuery) {
    return products;
  }

  return products.filter((product) =>
    [
      product.name,
      product.category,
      product.description,
      ...product.tags,
    ].some((value) => value.toLowerCase().includes(normalizedQuery))
  );
}

function dispatchWindowEvent<T>(eventName: string, detail: T) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<T>(eventName, { detail }));
}

function normalizeTestingSchema(
  schema: Record<string, unknown> | string | undefined
): Record<string, unknown> | undefined {
  if (!schema) {
    return undefined;
  }

  if (typeof schema !== "string") {
    return schema;
  }

  try {
    const parsed = JSON.parse(schema) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore malformed native schema strings and leave them undefined.
  }

  return undefined;
}

function searchProductsToolExecute(
  args: SearchProductsArgs
): SearchProductsResult {
  const query = typeof args.query === "string" ? args.query : "";
  const filteredProducts = searchProducts(query).map(toProductSearchResult);

  dispatchWindowEvent(PRODUCT_SEARCH_EVENT, { query });

  return {
    query,
    resultCount: filteredProducts.length,
    products: filteredProducts,
  };
}

function addToCartToolExecute(args: AddToCartArgs): AddToCartResult {
  const quantity = Math.max(1, Math.floor(args.quantity ?? 1));
  const product = products.find((item) => item.id === args.productId);

  if (!product) {
    throw new Error(
      `Unknown productId "${args.productId}". Use the searchProducts tool to find valid product IDs first.`
    );
  }

  dispatchWindowEvent(ADD_TO_CART_EVENT, {
    productId: product.id,
    quantity,
  });

  return {
    added: {
      productId: product.id,
      name: product.name,
      quantity,
      unitPrice: product.price,
      lineTotal: product.price * quantity,
    },
    message: `Added ${quantity} x ${product.name} to the cart.`,
  };
}

export const searchProductsTool: Tool<SearchProductsArgs, SearchProductsResult> =
  {
    execute: searchProductsToolExecute,
    name: "searchProducts",
    description:
      "Filter the visible product catalog by search text and return matching products with their IDs, names, categories, and prices.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search text matching product names, categories, descriptions, or tags.",
        },
      },
      required: ["query"],
    },
    outputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        resultCount: { type: "number" },
        products: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              category: { type: "string" },
              price: { type: "number" },
            },
            required: ["id", "name", "category", "price"],
          },
        },
      },
      required: ["query", "resultCount", "products"],
    },
    annotations: { readOnlyHint: true },
  };

export const addToCartTool: Tool<AddToCartArgs, AddToCartResult> = {
  execute: addToCartToolExecute,
  name: "addToCart",
  description:
    "Add a product to the current page cart by product ID. Use searchProducts first if you need to discover valid product IDs.",
  inputSchema: {
    type: "object",
    properties: {
      productId: {
        type: "string",
        description: "The product ID to add to the cart.",
      },
      quantity: {
        type: "number",
        description: "Optional quantity to add. Defaults to 1.",
      },
    },
    required: ["productId"],
  },
  outputSchema: {
    type: "object",
    properties: {
      added: {
        type: "object",
        properties: {
          productId: { type: "string" },
          name: { type: "string" },
          quantity: { type: "number" },
          unitPrice: { type: "number" },
          lineTotal: { type: "number" },
        },
        required: ["productId", "name", "quantity", "unitPrice", "lineTotal"],
      },
      message: { type: "string" },
    },
    required: ["added", "message"],
  },
};

const storeTools: Array<Tool<unknown, unknown>> = [
  searchProductsTool as Tool<unknown, unknown>,
  addToCartTool as Tool<unknown, unknown>,
];

function getModelContextTesting() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.navigator.modelContextTesting;
}

export const modelContextTest = {
  async listTools(): Promise<RegisteredTool[]> {
    const modelContextTesting = getModelContextTesting();

    if (modelContextTesting?.listTools) {
      const nativeTools =
        (await modelContextTesting.listTools()) as NativeRegisteredTool[];

      return nativeTools.map(
        ({ name, description, inputSchema, outputSchema, annotations }) => ({
          name,
          description,
          inputSchema: normalizeTestingSchema(inputSchema) ?? {},
          outputSchema: normalizeTestingSchema(outputSchema),
          annotations,
        })
      );
    }

    return Array.from(registeredTools.values()).map(
      ({ name, description, inputSchema, outputSchema, annotations }) => ({
        name,
        description,
        inputSchema,
        outputSchema,
        annotations,
      })
    );
  },

  async executeTool(name: string, args: unknown): Promise<unknown> {
    const modelContextTesting = getModelContextTesting();

    if (modelContextTesting?.executeTool) {
      const rawResult = await modelContextTesting.executeTool(
        name,
        JSON.stringify(args ?? {})
      );

      if (typeof rawResult !== "string") {
        return rawResult;
      }

      try {
        return JSON.parse(rawResult);
      } catch {
        return rawResult;
      }
    }

    const tool = registeredTools.get(name);

    if (!tool) {
      throw new Error(`Tool "${name}" is not registered.`);
    }

    return await tool.execute(args);
  },
};

export function registerStoreTools() {
  if (typeof window === "undefined") {
    return;
  }

  const modelContext = window.navigator.modelContext;

  if (!modelContext) {
    return;
  }

  for (const tool of storeTools) {
    registeredTools.set(tool.name, tool);

    const controller = new AbortController();
    toolControllers.set(tool.name, controller);

    try {
      modelContext.registerTool(tool, { signal: controller.signal });
    } catch {
      modelContext.registerTool(tool);
    }
  }
}

export function unregisterStoreTools() {
  if (typeof window === "undefined") {
    return;
  }

  const modelContext = window.navigator.modelContext;

  for (const tool of storeTools) {
    toolControllers.get(tool.name)?.abort();
    toolControllers.delete(tool.name);

    if (modelContext?.unregisterTool) {
      modelContext.unregisterTool(tool.name);
    }

    registeredTools.delete(tool.name);
  }
}

export const webMcpEvents = {
  addToCart: ADD_TO_CART_EVENT,
  searchProducts: PRODUCT_SEARCH_EVENT,
};
