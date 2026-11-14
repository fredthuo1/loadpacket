"use client";
import { useState } from "react";
import type { DriverInput } from "@/lib/api/management";
import {
  Field,
  Panel,
  buttonClass,
  secondaryClass,
  inputClass,
} from "./management-ui";

const fields = [
  ["firstName", "First Name", 100],
  ["lastName", "Last Name", 100],
  ["email", "Email", 254],
  ["phone", "Phone", 40],
  ["cdlNumber", "CDL Number", 50],
  ["cdlState", "CDL State", 60],
  ["cdlExpirationDate", "CDL Expiration", 10],
  ["hireDate", "Hire Date", 10],
] as const;
export function DriverForm({
  initial,
  emailLocked = false,
  saving,
  onSave,
  onCancel,
  submitLabel,
}: {
  initial?: DriverInput;
  emailLocked?: boolean;
  saving: boolean;
  onSave: (input: DriverInput) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [form, setForm] = useState<Record<keyof DriverInput, string>>(
    () =>
      Object.fromEntries([
        ...fields.map(([key]) => [key, initial?.[key] ?? ""]),
        ["notes", initial?.notes ?? ""],
      ]) as Record<keyof DriverInput, string>,
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = Object.fromEntries(
          Object.entries(form).map(([key, value]) => [
            key,
            key === "firstName" || key === "lastName"
              ? value.trim()
              : value.trim() || null,
          ]),
        ) as DriverInput;
        onSave(data);
      }}
    >
      <fieldset disabled={saving}>
        <Panel title="Driver Profile">
          <div className="grid gap-5 sm:grid-cols-2">
            {fields.map(([key, label, max]) => (
              <Field
                key={key}
                label={label}
                required={key === "firstName" || key === "lastName"}
                maxLength={max}
                value={form[key]}
                readOnly={key === 'email' && emailLocked}
                type={
                  key === "email"
                    ? "email"
                    : key === "cdlExpirationDate" || key === "hireDate"
                      ? "date"
                      : "text"
                }
                min={
                  key === "cdlExpirationDate" || key === "hireDate"
                    ? "1900-01-01"
                    : undefined
                }
                onChange={(event) =>
                  setForm({ ...form, [key]: event.target.value })
                }
              />
            ))}
          </div>
          <label className="mt-5 block text-sm font-semibold text-slate-700">
            Notes
            <textarea
              className={inputClass}
              rows={4}
              maxLength={5000}
              value={form.notes}
              onChange={(event) =>
                setForm({ ...form, notes: event.target.value })
              }
            />
          </label>
          <p className="mt-3 text-xs text-slate-600">
            {emailLocked ? 'Account email is read-only. Contact your administrator for email changes.' : 'Add an email to enable account invitations after saving the driver.'}
          </p>
        </Panel>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className={secondaryClass} onClick={onCancel}>
            Cancel
          </button>
          <button className={buttonClass} disabled={saving}>
            {saving ? "Saving…" : submitLabel}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
