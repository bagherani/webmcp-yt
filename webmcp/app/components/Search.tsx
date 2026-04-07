"use client";

import { CartSidebar } from "./store/CartSidebar";
import { ProductGrid } from "./store/ProductGrid";
import { SearchBar } from "./store/SearchBar";
import { StoreProvider } from "./store/store-context";

export default function Search() {
  return (
    <StoreProvider>
      <div className="min-h-screen w-full bg-slate-50 text-slate-950">
        <div className="grid min-h-screen gap-6 p-6 md:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="min-w-0 w-full space-y-6">
            <SearchBar />
            <ProductGrid />
          </section>
          <CartSidebar />
        </div>
      </div>
    </StoreProvider>
  );
}
