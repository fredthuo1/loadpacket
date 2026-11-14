// Decorative icons always accompany visible text; no icon-only controls.
export function UiIcon({
  name,
  className = "h-5 w-5",
}: {
  name: "document" | "plus";
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      {name === "plus" ? (
        <path d="M12 5v14M5 12h14" />
      ) : (
        <>
          <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
          <path d="M14 3v5h5M9 12h6M9 16h6" />
        </>
      )}
    </svg>
  );
}
