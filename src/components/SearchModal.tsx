"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export type SearchItem = {
  type: "case" | "precedent" | "split" | "justice" | "lawyer";
  title: string;
  subtitle: string;
  href: string;
};

const TYPE_LABELS: Record<SearchItem["type"], string> = {
  case: "Case",
  precedent: "Precedent",
  split: "Circuit Split",
  justice: "Justice",
  lawyer: "Counsel",
};

const TYPE_COLORS: Record<SearchItem["type"], string> = {
  case:      "bg-blue-100 text-blue-700",
  precedent: "bg-purple-100 text-purple-700",
  split:     "bg-amber-100 text-amber-700",
  justice:   "bg-emerald-100 text-emerald-700",
  lawyer:    "bg-slate-100 text-slate-600",
};

interface Props {
  onClose: () => void;
}

export function SearchModal({ onClose }: Props) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<SearchItem[] | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Fetch search index once on open
  useEffect(() => {
    fetch("/api/search-index")
      .then((r) => r.json())
      .then((data: SearchItem[]) => setIndex(data))
      .catch(() => setIndex([]));
  }, []);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const trimmed = query.trim();
  const results: SearchItem[] =
    trimmed.length < 2 || !index
      ? []
      : index
          .filter((item) => {
            const q = trimmed.toLowerCase();
            return (
              item.title.toLowerCase().includes(q) ||
              item.subtitle.toLowerCase().includes(q)
            );
          })
          .slice(0, 12);

  // Reset active index when result set changes
  useEffect(() => setActiveIdx(0), [results.length]);

  function navigate(href: string) {
    onClose();
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIdx]) {
      navigate(results[activeIdx].href);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <svg
            className="w-5 h-5 text-gray-400 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" />
            <path strokeLinecap="round" d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search cases, justices, counsel…"
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Clear"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Results */}
        {trimmed.length >= 2 ? (
          <div className="max-h-96 overflow-y-auto py-1">
            {index === null ? (
              <p className="px-4 py-3 text-sm text-gray-400">Loading&hellip;</p>
            ) : results.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400">
                No results for &ldquo;{query}&rdquo;
              </p>
            ) : (
              results.map((item, i) => (
                <button
                  key={`${item.type}-${i}`}
                  onClick={() => navigate(item.href)}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-2.5 transition-colors ${
                    i === activeIdx ? "bg-gray-50" : ""
                  }`}
                >
                  <span
                    className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                      TYPE_COLORS[item.type]
                    }`}
                  >
                    {TYPE_LABELS[item.type]}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-gray-900 truncate">
                      {item.title}
                    </span>
                    {item.subtitle && (
                      <span className="block text-xs text-gray-400 truncate">
                        {item.subtitle}
                      </span>
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : (
          <p className="px-4 py-3 text-xs text-gray-400">
            Type at least 2 characters to search &mdash; cases, justices, counsel, circuit splits, and precedents.
          </p>
        )}
      </div>
    </div>
  );
}
