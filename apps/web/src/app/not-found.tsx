import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg space-y-5 p-6 sm:p-10">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p>
        Check the link or return to your account to find your loads and
        documents.
      </p>
      <Link className="text-blue-700 underline" href="/login">
        Return to your account
      </Link>
    </main>
  );
}
