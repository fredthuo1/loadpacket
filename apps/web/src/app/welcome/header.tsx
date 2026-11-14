"use client";
import Link from "next/link";
import { useRef, useState } from "react";
export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <header
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            setOpen(false);
            menuRef.current?.focus();
          }
        }}
      >
        <div className="wrap nav">
          <a href="#" className="brand" aria-label="LoadPacket home">
            <svg
              className="brand-icon"
              viewBox="0 0 30 34"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M5 2h13l7 7v22H5z"
                stroke="#12645e"
                strokeWidth="2.2"
                strokeLinejoin="round"
              ></path>
              <path
                d="M18 2v8h7M10 16h10M10 21h10M10 26h6"
                stroke="#12645e"
                strokeWidth="2.2"
              ></path>
            </svg>
            LoadPacket<span style={{ color: "#12645e" }}>.</span>
          </a>
          <button
            className="menu"
            aria-controls="navlinks"
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            ref={menuRef}
          >
            {open ? "Close" : "Menu"}
          </button>
          <nav
            id="navlinks"
            aria-label="Main navigation"
            className={`navlinks ${open ? "open" : ""}`}
            onClick={() => setOpen(false)}
          >
            <a href="#how-it-works">How it works</a>
            <a href="#why-loadpacket">Why LoadPacket</a>
            <Link href="/login">Sign in</Link>
            <Link className="button" href="/auth/register">
              Get started <span aria-hidden="true">↗</span>
            </Link>
          </nav>
        </div>
      </header>
    </>
  );
}

