"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  managementRequest,
  type DriverInput,
  type DriverProfile,
} from "@/lib/api/management";
import { DriverForm } from "@/components/driver-form";
import { ManagementPage, Feedback } from "@/components/management-ui";
export default function NewDriverPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(input: DriverInput) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const driver = await managementRequest<DriverProfile>(
        "/drivers",
        "POST",
        input,
      );
      router.push(`/drivers/${driver.id}?created=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add driver.");
      setSaving(false);
    }
  }
  return (
    <ManagementPage
      title="Add Driver"
      description="Create an operational driver profile for your company."
    >
      <Feedback error={error} />
      <DriverForm
        saving={saving}
        onSave={(input) => void save(input)}
        onCancel={() => router.push("/drivers")}
        submitLabel="Add Driver"
      />
    </ManagementPage>
  );
}
