"use client";

import { useId, useState } from "react";
import { inputClass } from "./management-ui";

export function PasswordField({
  label = "Password",
  name = "password",
  autoComplete = "current-password",
  minLength,
  disabled = false,
}: {
  label?: string;
  name?: string;
  autoComplete?: string;
  minLength?: number;
  disabled?: boolean;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="flex min-w-0 items-center gap-2">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
          required
          disabled={disabled}
          className={`${inputClass} min-w-0 flex-1`}
        />
        <button
          type="button"
          disabled={disabled}
          aria-controls={id}
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
          className="min-h-11 shrink-0 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}
