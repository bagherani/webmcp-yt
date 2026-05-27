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

type ModelContext = {
  registerTool: (
    tool: Tool<unknown, unknown>,
    options?: { signal?: AbortSignal }
  ) => void;
  unregisterTool?: (name: string) => void;
  getTools?: () => Promise<RegisteredTool[]> | RegisteredTool[];
  executeTool?: (
    tool: RegisteredTool,
    args: unknown
  ) => Promise<unknown> | unknown;
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
  interface Document {
    modelContext?: ModelContext;
  }
}

const PRODUCT_SEARCH_EVENT = "webmcp:search-products";
const ADD_TO_CART_EVENT = "webmcp:add-to-cart";

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

function getModelContext() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return document.modelContext;
}

export function registerStoreTools() {
  const modelContext = getModelContext();

  if (!modelContext) {
    return;
  }

  for (const tool of storeTools) {
    toolControllers.get(tool.name)?.abort();
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
  const modelContext = getModelContext();

  for (const tool of storeTools) {
    toolControllers.get(tool.name)?.abort();
    toolControllers.delete(tool.name);

    if (modelContext?.unregisterTool) {
      modelContext.unregisterTool(tool.name);
    }

  }
}

export const webMcpEvents = {
  addToCart: ADD_TO_CART_EVENT,
  searchProducts: PRODUCT_SEARCH_EVENT,
};
