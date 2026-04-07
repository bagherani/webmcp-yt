"use client";

import { products } from "../../db";
import { ProductCard } from "./ProductCard";
import { useStore } from "./store-context";

const emptyGridSlots = Array.from({ length: products.length });

function EmptyState() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-8 flex justify-center px-6">
      <article className="rounded-3xl bg-white/92 p-8 text-center shadow-sm ring-1 ring-slate-200 backdrop-blur-sm">
        <h2 className="text-xl font-semibold text-slate-950">No products found</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Try a different search term.
        </p>
      </article>
    </div>
  );
}

function EmptyGridSkeleton() {
  return emptyGridSlots.map((_, index) => (
    <div
      key={`empty-slot-${index}`}
      aria-hidden="true"
      className="pointer-events-none flex h-full flex-col rounded-3xl bg-white/70 p-5 opacity-30 shadow-sm ring-1 ring-slate-200"
    >
      <div className="mb-4 aspect-4/3 rounded-2xl bg-slate-200" />
      <div className="h-7 w-2/3 rounded bg-slate-200" />
      <div className="mt-3 h-24 rounded bg-slate-100" />
      <div className="mt-4 h-7 w-24 rounded bg-slate-200" />
      <div className="mt-6 h-12 rounded-2xl bg-slate-200" />
    </div>
  ));
}

export function ProductGrid() {
  const { filteredProducts } = useStore();

  return (
    <div className="relative min-h-168 w-full">
      <div className="grid min-h-168 w-full gap-5 md:grid-cols-2 xl:grid-cols-3">
        {filteredProducts.length > 0
          ? filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))
          : <EmptyGridSkeleton />}
      </div>

      {filteredProducts.length === 0 ? <EmptyState /> : null}
    </div>
  );
}
