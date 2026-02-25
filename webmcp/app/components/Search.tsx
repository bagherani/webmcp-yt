"use client";

import { useEffect, useState } from "react";
import {
  registerSearchTools,
  searchNames,
  unregisterSearchTools,
} from "../webmcp";

export default function Search() {
  const [search, setSearch] = useState<string>("");
  const filteredNames = searchNames(search);

  useEffect(() => {
    const handleSearchNames = (event: CustomEvent<{ query: string }>) => {
      setSearch(event.detail.query);
    };

    window.addEventListener("searchNames", handleSearchNames as EventListener);
    registerSearchTools();

    return () => {
      window.removeEventListener("searchNames", handleSearchNames as EventListener);
      unregisterSearchTools();
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <input
        className="border border-gray-300 rounded-md p-2 text-3xl"
        type="text"
        placeholder="Search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <ul className="list-disc list-inside text-3xl">
        {filteredNames.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </div>
  );
}
