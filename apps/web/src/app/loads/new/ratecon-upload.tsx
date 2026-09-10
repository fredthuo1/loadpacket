"use client";

import { ChangeEvent, useRef, useState } from "react";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedDocument, setUploadedDocument] =
    useState<UploadedDocument | null>(null);

  function handleChooseFile() {
    fileInputRef.current?.click();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    setError(null);
    setUploadedDocument(null);

    if (!file) {
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      setSelectedFile(null);
      setError("Please choose a PDF, JPG, or PNG file.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setSelectedFile(null);
      setError("The file must be 10 MB or smaller.");
      event.target.value = "";
      return;
    }

    setSelectedFile(file);
  }

  function handleRemoveFile() {
    setSelectedFile(null);
    setError(null);
    setUploadedDocument(null);

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
    setUploadedDocument(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch(
        `${API_BASE_URL}/documents/ratecon`,
        {
          method: "POST",
          body: formData,
        },
      );

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
          // Keep the default error message.
        }

        throw new Error(message);
      }

      const document =
        (await response.json()) as UploadedDocument;

      setUploadedDocument(document);
    } catch (uploadError) {
      if (uploadError instanceof Error) {
        setError(uploadError.message);
      } else {
        setError("Unable to upload Rate Confirmation.");
      }
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="mt-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        onChange={handleFileChange}
        className="hidden"
      />

      {!selectedFile ? (
        <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <div className="text-4xl">📄</div>

          <p className="mt-4 font-semibold text-slate-900">
            Drop your RateCon here
          </p>

          <p className="mt-1 text-sm text-slate-500">
            PDF, JPG or PNG · Maximum 10 MB
          </p>

          <button
            type="button"
            onClick={handleChooseFile}
            className="mt-5 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Choose File
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-emerald-800">
                Rate Confirmation selected
              </p>

              <p className="mt-2 font-semibold text-slate-900">
                {selectedFile.name}
              </p>

              <p className="mt-1 text-sm text-slate-600">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>

            <button
              type="button"
              onClick={handleRemoveFile}
              disabled={isUploading}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Remove
            </button>
          </div>

          {!uploadedDocument && (
            <button
              type="button"
              onClick={handleUpload}
              disabled={isUploading}
              className="mt-5 w-full rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUploading
                ? "Uploading..."
                : "Continue"}
            </button>
          )}

          {uploadedDocument && (
            <div className="mt-5 rounded-lg border border-emerald-300 bg-white p-4">
              <p className="font-semibold text-emerald-700">
                ✓ Rate Confirmation uploaded
              </p>

              <p className="mt-2 text-sm text-slate-600">
                Document ID
              </p>

              <p className="mt-1 break-all font-mono text-xs text-slate-900">
                {uploadedDocument.id}
              </p>

              <p className="mt-3 text-sm text-slate-600">
                Status:{" "}
                <span className="font-semibold text-slate-900">
                  {uploadedDocument.status}
                </span>
              </p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-medium text-red-700">
            {error}
          </p>
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