"use client";

import { formatPrice } from "./format";
import { useStore } from "./store-context";

export function CartSidebar() {
  const { cartItems, cartItemCount, cartTotal } = useStore();

  return (
    <aside className="h-fit rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:sticky md:top-6">
      <div className="border-b border-slate-200 pb-4">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
          Cart
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">
          {cartItemCount} item{cartItemCount === 1 ? "" : "s"}
        </h2>
      </div>

      <div className="mt-4 space-y-3">
        {cartItems.length === 0 ? (
          <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            Your cart is empty. Add a product manually or invoke the `addToCart`
            {" "}WebMCP tool.
          </p>
        ) : (
          cartItems.map((item) => (
            <div
              key={item.product.id}
              className="rounded-2xl bg-slate-50 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">
                    {item.product.name}
                  </p>
                  <p className="text-sm text-slate-500">Qty {item.quantity}</p>
                </div>
                <p className="text-sm font-semibold text-slate-900">
                  {formatPrice(item.product.price * item.quantity)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-5 border-t border-slate-200 pt-4">
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>Subtotal</span>
          <span className="font-semibold text-slate-950">
            {formatPrice(cartTotal)}
          </span>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Cart state is intentionally ephemeral and resets on refresh.
        </p>
      </div>
    </aside>
  );
}
