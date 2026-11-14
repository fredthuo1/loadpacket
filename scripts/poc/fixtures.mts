import { hash, uuid } from "./core.mts";
export type Value = string | number | boolean | null | Buffer | object;
export interface Fixture {
  model: string;
  table: string;
  row: Record<string, Value>;
}
export function fixtures(runId: string): Fixture[] {
  const result: Fixture[] = [];
  const time = "2026-01-15T12:00:00.000Z";
  for (const tenant of ["a", "b"]) {
    const id = (s: string) => uuid(`${runId}:${tenant}:${s}`);
    const org = id("org");
    const add = (
      model: string,
      table: string,
      label: string,
      row: Record<string, Value>,
      updated = false,
    ) => {
      result.push({
        model,
        table,
        row: {
          id: id(label),
          ...(model === "Organization" ? {} : { organization_id: org }),
          created_at: time,
          ...(updated ? { updated_at: time } : {}),
          ...row,
        },
      });
    };
    add(
      "Organization",
      "organizations",
      "org",
      { name: `Fictional POC ${tenant.toUpperCase()}` },
      true,
    );
    for (const role of ["OWNER", "DISPATCHER", "BACK_OFFICE", "DRIVER"])
      add(
        "User",
        "users",
        role,
        {
          auth_user_id: id("auth-" + role),
          role,
          first_name: "Fictional",
          last_name: role,
          email: `${role.toLowerCase()}-${tenant}@example.invalid`,
        },
        true,
      );
    // The actual schema has no ADMIN role. OWNER is the fictional admin persona.
    add(
      "Driver",
      "drivers",
      "driver",
      {
        user_id: id("DRIVER"),
        first_name: "Fictional",
        last_name: "Driver",
        email: `driver-${tenant}@example.invalid`,
      },
      true,
    );
    add(
      "Load",
      "loads",
      "load",
      {
        load_number: `POC-${tenant}-LIVE`,
        broker_name: "Fictional Broker",
        total_rate: "1234.56",
        linehaul: "1200.00",
        fuel_surcharge: "34.56",
      },
      true,
    );
    add(
      "LoadAssignment",
      "load_assignments",
      "assignment",
      { load_id: id("load"), driver_id: id("driver") },
      true,
    );
    for (const [i, type] of ["PICKUP", "DELIVERY"].entries())
      add(
        "LoadStop",
        "load_stops",
        "stop-" + i,
        {
          load_id: id("load"),
          sequence: i + 1,
          type,
          address: "100 Fictional Lane, Example City",
        },
        true,
      );
    for (const type of ["RATE_CONFIRMATION", "BOL", "POD", "OTHER"]) {
      const doc = id("doc-" + type),
        version = id("version-" + type);
      add("Document", "documents", "doc-" + type, { type }, true);
      add("DocumentVersion", "document_versions", "version-" + type, {
        document_id: doc,
        version_number: 1,
        original_file_name: `fictional-${type}.pdf`,
        mime_type: "application/pdf",
        size_bytes: 8,
        checksum: hash("POC ONLY"),
        storage_key: `documents/${doc}/v1.pdf`,
        uploaded_by_user_id: id("OWNER"),
        upload_key: id("upload-" + type),
      });
      if (type !== "OTHER") {
        add("LoadDocument", "load_documents", "link-" + type, {
          load_id: id("load"),
          document_id: doc,
          role: type,
        });
        if (type !== "RATE_CONFIRMATION")
          add(
            "LoadRequirement",
            "load_requirements",
            "requirement-" + type,
            {
              load_id: id("load"),
              document_type: type,
              requirement: "REQUIRED",
              status: "RECEIVED",
              current_version_id: version,
            },
            true,
          );
      }
    }
    add("OrganizationDocument", "organization_documents", "orgdoc", {
      document_id: id("doc-OTHER"),
      type: "W9",
    });
    add("DriverDocument", "driver_documents", "driverdoc", {
      document_id: id("doc-BOL"),
      driver_id: id("driver"),
      type: "OTHER",
    });
    add("LoadPayment", "load_payments", "payment", {
      load_id: id("load"),
      amount: "100.01",
      currency: "USD",
      idempotency_key: "poc-payment",
      recorded_at: time,
      recorded_by_user_id: id("OWNER"),
    });
    add(
      "DriverInvitation",
      "driver_invitations",
      "invitation",
      {
        driver_id: id("driver"),
        email: `driver-${tenant}@example.invalid`,
        auth_user_id: id("auth-DRIVER"),
      },
      true,
    );
    add("LoadEvent", "load_events", "event", {
      load_id: id("load"),
      type: "LOAD_CREATED",
      metadata: { synthetic: true, runId },
    });
    add(
      "LoadChargeOpportunity",
      "load_charge_opportunities",
      "opportunity",
      {
        load_id: id("load"),
        type: "DETENTION",
        amount: "20.00",
        evidence: { synthetic: true },
      },
      true,
    );
    add(
      "Agreement",
      "agreements",
      "agreement",
      {
        load_id: id("load"),
        type: "RATE_CONFIRMATION",
        title: "Fictional POC agreement",
      },
      true,
    );
    add("AgreementVersion", "agreement_versions", "agreementversion", {
      agreement_id: id("agreement"),
      source_document_version_id: id("version-RATE_CONFIRMATION"),
      version_number: 1,
      content_hash: hash("fictional-terms"),
      terms: { synthetic: true },
      total_amount: "1234.56",
    });
    add("AgreementAcceptance", "agreement_acceptances", "acceptance", {
      agreement_version_id: id("agreementversion"),
      party_role: "CARRIER",
      method: "CLICK_ACCEPT",
      accepted_by_name: "Fictional Owner",
      consent_text: "Synthetic POC evidence only",
    });
    add(
      "ExternalTransactionAccess",
      "external_transaction_access",
      "external",
      {
        load_id: id("load"),
        role: "BROKER",
        token_hash: hash(id("external")),
        expires_at: "2026-01-16T12:00:00.000Z",
        permissions: { synthetic: true },
      },
      true,
    );
    const bytes = Buffer.from("load,amount\nFICTIONAL,12.34\n");
    add("FinancialImportBatch", "financial_import_batches", "batch", {
      file_name: "fictional.csv",
      file_checksum: hash(bytes),
      file_bytes: bytes,
      mime_type: "text/csv",
      headers: ["load", "amount"],
      column_mapping: { loadNumber: "load" },
      counts: { total: 1 },
      created_by_id: id("OWNER"),
    });
    add("FinancialImportRow", "financial_import_rows", "row", {
      batch_id: id("batch"),
      row_number: 2,
      status: "VALID",
      normalized_data: { amount: "12.34" },
      issues: [],
    });
    // This model has no created_at column.
    delete result[result.length - 1].row.created_at;
    add("HistoricalLoadRecord", "historical_load_records", "history", {
      load_number: `POC-${tenant}-HISTORY`,
      broker_name: "Fictional Historical Broker",
      delivery_date: "2026-01-14",
      gross_revenue: "234.56",
      payment_status: "UNPAID",
      import_batch_id: id("batch"),
      import_row_number: 2,
      miles: "12.34",
    });
    add("FinancialTransaction", "financial_transactions", "finance", {
      type: "EXPENSE",
      effect: "EXPENSE",
      category: "Fuel",
      amount: "12.34",
      transaction_date: "2026-01-15",
      description: "Fictional POC fuel",
      load_id: id("load"),
      idempotency_key: "poc-finance",
      created_by_id: id("OWNER"),
    });
    add("FinancialAuditEvent", "financial_audit_events", "audit", {
      actor_id: id("OWNER"),
      action: "TRANSACTION_CREATED",
      record_id: id("finance"),
      record_type: "TRANSACTION",
      summary: "Synthetic POC record",
      details: { amount: "12.34" },
    });
    add("DocumentSignature", "document_signatures", "signature", {
      load_id: id("load"),
      document_id: id("doc-POD"),
      document_version_id: id("version-POD"),
      document_type: "POD",
      signer_name: "Fictional Receiver",
      signer_role: "RECEIVER",
      signature_storage_key: `documents/${id("doc-POD")}/${id("signature")}.png`,
      signature_checksum: hash("FICTIONAL SIGNATURE METADATA"),
      created_by_user_id: id("DRIVER"),
      idempotency_key: "poc-signature",
    });
  }
  return result;
}
