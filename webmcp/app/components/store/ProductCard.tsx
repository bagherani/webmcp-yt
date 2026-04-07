"use client";

import Image from "next/image";
import type { Product } from "../../db";
import { formatPrice } from "./format";
import { useStore } from "./store-context";

export function ProductCard({ product }: { product: Product }) {
  const { addProductToCart } = useStore();

  return (
    <article className="flex h-full flex-col rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="relative mb-4 aspect-4/3 overflow-hidden rounded-2xl bg-slate-200">
        <Image
          src={product.imageUrl}
          alt={product.name}
          fill
          sizes="(max-width: 767px) 100vw, (max-width: 1279px) 60vw, 33vw"
          className="object-cover"
        />
      </div>

      <h2 className="text-xl font-semibold text-slate-950">{product.name}</h2>

      <p className="mt-3 text-sm leading-6 text-slate-600">
        {product.description}
      </p>

      <p className="mt-4 text-lg font-semibold text-slate-950">
        {formatPrice(product.price)}
      </p>

      <button
        className="mt-6 inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        type="button"
        onClick={() => addProductToCart(product.id)}
      >
        Add to cart
      </button>
    </article>
  );
}
