"use client";

import { useStore } from "./store-context";

export function SearchBar() {
  const { search, setSearch } = useStore();

  return (
    <div className="w-full rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <input
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none transition focus:border-slate-400 focus:bg-white"
        type="text"
        placeholder="Search products..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
    </div>
  );
}
