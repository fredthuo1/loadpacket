"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { logout, useCurrentUser } from "./auth-provider";
import { canVisit, landingPage } from "@/lib/auth/types";
import { UiIcon } from "./ui-icon";

const navigation = [
  {
    label: "Dashboard",
    href: "/",
  },
  { label: "Loads", href: "/#loads" },
  { label: "Drivers", href: "/drivers" },
  { label: "Documents", href: "/documents" },
  { label: "Finance", href: "/finance" },
  { label: "Settlements", href: "/finance/settlements" },
  {
    label: "Accounts Receivable",
    href: "/back-office/accounts-receivable",
  },
  { label: "Back Office", href: "/back-office" },
  { label: "Team & Access", href: "/settings/team" },
  { label: "Company Settings", href: "/settings/company" },
  {
    label: "Driver",
    href: "/driver",
  },
];

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}
const getHash = () => window.location.hash;
const getServerHash = () => "";

export function AppHeader() {
  const pathname = usePathname();
  const hash = useSyncExternalStore(subscribeHash, getHash, getServerHash);
  const user = useCurrentUser();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  function isActive(href: string) {
    if (href === "/") {
      return pathname === "/" && hash !== "#loads";
    }

    if (href === "/#loads") {
      return (pathname === "/" && hash === "#loads") || pathname.startsWith("/loads/");
    }

    if (href === "/back-office") return pathname === href;
    if (href === "/finance") return (pathname === href || pathname.startsWith("/finance/")) && !pathname.startsWith("/finance/settlements");

    return pathname.startsWith(href);
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link
          href={user ? landingPage(user.role) : "/login"}
          className="group flex items-center gap-3"
        >
          <span className="rounded-xl bg-blue-50 p-2.5 text-blue-700">
            <UiIcon name="document" />
          </span>
          <div>
            <p className="text-xl font-black tracking-tight text-slate-950">
              LoadPacket
            </p>

            <p className="text-xs font-medium text-slate-600">
              {user?.role === "DRIVER" ? "Driver" : "Carrier Operations"}
            </p>
          </div>
        </Link>

        <div className="contents">
          <div className="flex flex-wrap items-center gap-3">
            {user && (user.role === "OWNER" || user.role === "DISPATCHER") && (
              <Link
                href="/loads/new"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-600"
              >
                <UiIcon name="plus" /> New Load
              </Link>
            )}
            <span className="text-sm text-slate-600">
              {user?.firstName} {user?.lastName}
            </span>
            <button
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() =>
                void logout().catch((error) =>
                  setLogoutError(
                    error instanceof Error ? error.message : "Sign-out failed.",
                  ),
                )
              }
            >
              Sign out
            </button>
            {logoutError && (
              <p role="alert" className="text-sm text-red-700">
                {logoutError}
              </p>
            )}
          </div>
          <nav aria-label="Primary navigation" className="flex w-full flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1">
            {navigation
              .filter(
                (item) => user && canVisit(user.role, item.href.split("#")[0]),
              )
              .map((item, index) => {
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={
                      active
                        ? item.href === "/#loads"
                          ? "location"
                          : "page"
                        : undefined
                    }
                    onClick={(event) => {
                      setMoreOpen(false);
                      if (
                        !["/", "/#loads"].includes(item.href) ||
                        pathname !== "/" ||
                        event.button !== 0 ||
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey
                      )
                        return;
                      event.preventDefault();
                      if (item.href === "/") {
                        if (window.location.hash) {
                          window.history.pushState(null, "", "/");
                          window.dispatchEvent(new Event("hashchange"));
                        }
                        window.scrollTo({ top: 0 });
                        return;
                      }
                      if (window.location.hash !== "#loads") {
                        window.location.hash = "loads";
                      }
                      // Repeated clicks must scroll even when the hash is unchanged.
                      document.getElementById("loads")?.scrollIntoView({
                        block: "start",
                      });
                    }}
                    className={`${index > 1 && !moreOpen ? "hidden lg:inline-flex" : "inline-flex"} min-h-11 items-center rounded-lg px-3 py-2 text-sm font-semibold transition ${
                      active
                        ? "bg-white text-slate-950 shadow-sm"
                        : "text-slate-600 hover:bg-white/70 hover:text-slate-950"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)} className="min-h-11 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 lg:hidden">{moreOpen ? "Less" : "More"}</button>
          </nav>
        </div>
      </div>
    </header>
  );
}
