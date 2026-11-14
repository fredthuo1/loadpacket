"use client";
import { useEffect, useState } from "react";
import { managementRequest, type CompanyProfile } from "@/lib/api/management";
import {
  ManagementPage,
  Panel,
  Field,
  Feedback,
  buttonClass,
} from "@/components/management-ui";

const groups = [
  {
    title: "Business",
    fields: [
      ["name", "Legal Company Name", 200],
      ["dbaName", "DBA / Display Name", 200],
      ["mcNumber", "MC Number", 30],
      ["usdotNumber", "USDOT Number", 30],
    ],
  },
  {
    title: "Contact",
    fields: [
      ["email", "Email", 254],
      ["phone", "Phone", 40],
    ],
  },
  {
    title: "Address",
    fields: [
      ["addressLine1", "Address Line 1", 200],
      ["addressLine2", "Address Line 2", 200],
      ["city", "City", 100],
      ["state", "State", 100],
      ["postalCode", "Postal Code", 20],
      ["country", "Country", 60],
    ],
  },
  {
    title: "Operations",
    fields: [
      ["timezone", "Timezone", 100],
      ["defaultPaymentTermsDays", "Default Payment Terms Days", 3],
    ],
  },
] as const;
const keys = groups.flatMap((group) => group.fields.map(([key]) => key));
type Values = Record<(typeof keys)[number], string>;
function values(profile: CompanyProfile) {
  return Object.fromEntries(
    keys.map((key) => [key, String(profile[key] ?? "")]),
  ) as Values;
}
export default function CompanyPage() {
  const [form, setForm] = useState<Values | null>(null);
  const [original, setOriginal] = useState<Values | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    managementRequest<CompanyProfile>("/company")
      .then((profile) => {
        if (alive) {
          setForm(values(profile));
          setOriginal(values(profile));
        }
      })
      .catch((err) => {
        if (alive) setError(err.message);
      });
    return () => {
      alive = false;
    };
  }, [attempt]);
  const dirty = !!form && keys.some((key) => form[key] !== original?.[key]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form || saving) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const patch = Object.fromEntries(
        keys
          .filter((key) => form[key] !== original?.[key])
          .map((key) => [
            key,
            key === "defaultPaymentTermsDays"
              ? Number(form[key])
              : form[key].trim() || null,
          ]),
      );
      const result = await managementRequest<CompanyProfile>(
        "/company",
        "PATCH",
        patch,
      );
      setForm(values(result));
      setOriginal(values(result));
      setSuccess("Company profile saved.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save company profile.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <ManagementPage
      title="Company Profile"
      description="Keep your carrier’s business, contact and operating details up to date."
    >
      <Feedback error={error} success={success} />
      {!form && error && <button className={`${buttonClass} mb-5`} onClick={() => { setError(null); setAttempt((value) => value + 1); }}>Retry company profile</button>}
      <p className="mb-5 text-sm text-slate-600">
        Your legal company name identifies newly issued invoices. Review your
        contact details, address and default payment terms below. Optional
        details can be completed later. Use Team &amp; Access to invite office
        staff, or Dashboard to enter the product.
      </p>
      {!form ? (
        !error && <p role="status">Loading company profile…</p>
      ) : (
        <form onSubmit={save}>
          <fieldset disabled={saving} className="space-y-6">
            {groups.map((group) => (
              <Panel key={group.title} title={group.title}>
                <div className="grid gap-5 sm:grid-cols-2">
                  {group.fields.map(([key, label, max]) => (
                    <Field
                      key={key}
                      label={label}
                      value={form[key]}
                      required={[
                        "name",
                        "country",
                        "timezone",
                        "defaultPaymentTermsDays",
                      ].includes(key)}
                      type={
                        key === "email"
                          ? "email"
                          : key === "defaultPaymentTermsDays"
                            ? "number"
                            : "text"
                      }
                      maxLength={max}
                      min={key === "defaultPaymentTermsDays" ? 0 : undefined}
                      max={key === "defaultPaymentTermsDays" ? 365 : undefined}
                      step={key === "defaultPaymentTermsDays" ? 1 : undefined}
                      onChange={(event) => {
                        setForm({ ...form, [key]: event.target.value });
                        setSuccess(null);
                      }}
                    />
                  ))}
                </div>
                {group.title === "Operations" && (
                  <p className="mt-4 text-xs text-slate-600">
                    Payment terms: 0–365 whole days; 0 means due on the invoice
                    date. New invoices use an explicit override, then agreed
                    load terms, then this default. Issued invoices never change
                    when this profile changes. Billing dates currently use
                    America/Chicago calendar days, independently of this
                    operational timezone setting.
                  </p>
                )}
              </Panel>
            ))}
            <div className="flex justify-end">
              <button className={buttonClass} disabled={saving || !dirty}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </ManagementPage>
  );
}
