"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { products, type Product } from "../../db";
import {
  registerStoreTools,
  searchProducts,
  unregisterStoreTools,
  webMcpEvents,
} from "../../webmcp";

export type CartItem = {
  product: Product;
  quantity: number;
};

type StoreContextValue = {
  search: string;
  setSearch: (value: string) => void;
  filteredProducts: Product[];
  cartItems: CartItem[];
  cartItemCount: number;
  cartTotal: number;
  addProductToCart: (productId: string, quantity?: number) => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState("");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  const filteredProducts = useMemo(() => searchProducts(search), [search]);

  const cartItemCount = useMemo(
    () => cartItems.reduce((total, item) => total + item.quantity, 0),
    [cartItems]
  );

  const cartTotal = useMemo(
    () =>
      cartItems.reduce(
        (total, item) => total + item.product.price * item.quantity,
        0
      ),
    [cartItems]
  );

  const addProductToCart = useCallback((productId: string, quantity = 1) => {
    const product = products.find((item) => item.id === productId);

    if (!product) {
      return;
    }

    setCartItems((currentItems) => {
      const existingItem = currentItems.find(
        (item) => item.product.id === productId
      );

      if (!existingItem) {
        return [...currentItems, { product, quantity }];
      }

      return currentItems.map((item) =>
        item.product.id === productId
          ? { ...item, quantity: item.quantity + quantity }
          : item
      );
    });
  }, []);

  useEffect(() => {
    const handleSearchProducts = (
      event: CustomEvent<{ query: string }>
    ) => {
      setSearch(event.detail.query);
    };

    const handleAddToCart = (
      event: CustomEvent<{ productId: string; quantity: number }>
    ) => {
      addProductToCart(event.detail.productId, event.detail.quantity);
    };

    window.addEventListener(
      webMcpEvents.searchProducts,
      handleSearchProducts as EventListener
    );
    window.addEventListener(
      webMcpEvents.addToCart,
      handleAddToCart as EventListener
    );
    registerStoreTools();

    return () => {
      window.removeEventListener(
        webMcpEvents.searchProducts,
        handleSearchProducts as EventListener
      );
      window.removeEventListener(
        webMcpEvents.addToCart,
        handleAddToCart as EventListener
      );
      unregisterStoreTools();
    };
  }, [addProductToCart]);

  const value = useMemo(
    () => ({
      search,
      setSearch,
      filteredProducts,
      cartItems,
      cartItemCount,
      cartTotal,
      addProductToCart,
    }),
    [
      search,
      filteredProducts,
      cartItems,
      cartItemCount,
      cartTotal,
      addProductToCart,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);

  if (!context) {
    throw new Error("useStore must be used within a StoreProvider.");
  }

  return context;
}
