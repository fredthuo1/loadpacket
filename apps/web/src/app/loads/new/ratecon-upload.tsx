"use client";
import { apiFetch, API_BASE_URL } from "@/lib/api/api-fetch";
import { buttonClass } from "@/components/management-ui";
import { UiIcon } from "@/components/ui-icon";

import { ChangeEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg"];

type UploadedDocument = {
  id: string;
  documentType: string;
  version: number;
  originalFileName: string;
  mimeType: string;
  size: number;
  checksum: string;
  status: string;
  uploadedAt: string;
};

export default function RateConUpload() {
  const router = useRouter();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [isUploading, setIsUploading] = useState(false);

  function handleChooseFile() {
    fileInputRef.current?.click();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    setError(null);

    if (!file) {
      return;
    }

    if (
      !ALLOWED_TYPES.includes(file.type) ||
      !/\.(pdf|png|jpe?g)$/i.test(file.name)
    ) {
      setSelectedFile(null);

      setError("Upload a PDF, PNG or JPEG Rate Confirmation.");

      event.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setSelectedFile(null);

      setError("The document must be 10 MB or smaller.");

      event.target.value = "";
      return;
    }

    if (file.size === 0) {
      setSelectedFile(null);

      setError("The selected document is empty.");

      event.target.value = "";
      return;
    }

    setSelectedFile(file);
  }

  function handleRemoveFile() {
    setSelectedFile(null);
    setError(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleUpload() {
    if (!selectedFile) {
      setError("Please choose a Rate Confirmation first.");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();

      formData.append("file", selectedFile);

      const response = await apiFetch(`${API_BASE_URL}/documents/ratecon`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let message = "Unable to upload Rate Confirmation.";

        try {
          const body = (await response.json()) as {
            message?: string | string[];
          };

          if (Array.isArray(body.message)) {
            message = body.message.join(", ");
          } else if (body.message) {
            message = body.message;
          }
        } catch {
          // Keep the default message.
        }

        throw new Error(message);
      }

      const document = (await response.json()) as UploadedDocument;

      router.push(`/loads/new/review/${document.id}`);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Unable to upload Rate Confirmation.",
      );
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="mt-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
        onChange={handleFileChange}
        className="hidden"
      />

      {!selectedFile ? (
        <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <div className="mx-auto w-fit rounded-xl bg-blue-50 p-3 text-blue-700">
            <UiIcon name="document" className="h-8 w-8" />
          </div>

          <p className="mt-4 font-semibold text-slate-900">
            Upload your Rate Confirmation
          </p>

          <p className="mt-1 text-sm text-slate-600">
            PDF, PNG or JPEG · Maximum 10 MB
          </p>

          <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-600">
            LoadPacket will read the Rate Confirmation and prepare the load
            details for your review.
          </p>

          <button
            type="button"
            onClick={handleChooseFile}
            className={`mt-5 ${buttonClass}`}
          >
            Choose document
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-emerald-800">
                Rate Confirmation selected
              </p>

              <p className="mt-2 break-all font-semibold text-slate-900">
                {selectedFile.name}
              </p>

              <p className="mt-1 text-sm text-slate-600">
                {formatFileSize(selectedFile.size)}
              </p>

              <p className="mt-1 text-xs text-slate-600">{selectedFile.type}</p>
            </div>

            <button
              type="button"
              onClick={handleRemoveFile}
              disabled={isUploading}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-100 disabled:bg-slate-100 disabled:text-slate-600"
            >
              Remove
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleUpload()}
            disabled={isUploading}
            className={`mt-5 w-full ${buttonClass}`}
          >
            {isUploading ? "Uploading RateCon..." : "Continue"}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-medium text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} bytes`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
