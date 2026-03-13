"use client";

import { useState } from "react";
import { SearchModal } from "./SearchModal";

const NAV_ITEMS = [
  { label: "About", href: "#about" },
  { label: "The Docket", href: "#docket" },
  { label: "Justices", href: "#justices" },
  { label: "Counsel", href: "#counsel" },
  { label: "Circuit Map", href: "#circuit-map" },
  { label: "Court Calendar", href: "#court-calendar" },
  { label: "Circuit Splits", href: "/appeals" },
  { label: "Appellate Impacts", href: "/appellate-impacts" },
  { label: "Analysis", href: "/analysis" },
];

function SearchIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <path strokeLinecap="round" d="m21 21-4.35-4.35" />
    </svg>
  );
}

export function NavBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <>
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}

      <nav className="mt-8 border-t border-[#f0b896]">

        {/* Mobile: row with search + hamburger */}
        <div className="flex md:hidden items-center justify-between px-4 py-2">
          <button
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="p-2 text-gray-900 hover:text-gray-600"
          >
            <SearchIcon />
          </button>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle menu"
            className="p-2 text-gray-900"
          >
            {menuOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile: dropdown */}
        {menuOpen && (
          <div className="md:hidden border-t border-[#f0b896] bg-ft-pink">
            {NAV_ITEMS.map(({ label, href }) => (
              <a
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="block px-6 py-3 text-base font-semibold text-gray-900 hover:bg-[#f5c4a0] border-b border-[#f0b896] last:border-b-0"
              >
                {label}
              </a>
            ))}
          </div>
        )}

        {/* Desktop: nav items centered, search icon pinned right */}
        <div className="hidden md:flex items-stretch relative">
          <ul className="flex flex-1 justify-center gap-0">
            {NAV_ITEMS.map(({ label, href }) => (
              <li key={href}>
                <a
                  href={href}
                  className="block px-8 py-4 text-lg font-semibold text-gray-900 hover:bg-[#f5c4a0] transition-colors border-b-2 border-transparent hover:border-gray-900"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <div className="absolute right-0 top-0 bottom-0 flex items-center pr-4">
            <button
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
              className="p-2 text-gray-700 hover:text-gray-900 hover:bg-[#f5c4a0] rounded transition-colors"
            >
              <SearchIcon />
            </button>
          </div>
        </div>

      </nav>
    </>
  );
}
