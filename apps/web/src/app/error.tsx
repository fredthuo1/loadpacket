"use client";

import Link from "next/link";
import { buttonClass } from "@/components/management-ui";

export default function ScreenError({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto max-w-lg space-y-5 p-6 sm:p-10">
      <h1 className="text-2xl font-bold">This screen could not load</h1>
      <p role="alert">
        Try loading it again. If a save was interrupted, check the record before
        submitting again.
      </p>
      <button className={buttonClass} onClick={retry}>
        Try again
      </button>
      <Link className="block text-blue-700 underline" href="/login">
        Return to your account
      </Link>
    </main>
  );
}
