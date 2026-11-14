export interface UploadFile {
  uri: string;
  name: string;
  type: string;
  size?: number;
}
export function validateFile(file: UploadFile) {
  if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type))
    throw new Error("Choose a PDF, JPEG, or PNG file.");
  if (file.size === undefined || file.size <= 0)
    throw new Error(
      "Could not read the file size. Please choose another file.",
    );
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Choose a file smaller than 10 MB.");
  return file;
}
export function uploadForm(file: UploadFile) {
  validateFile(file);
  const form = new FormData();
  // React Native fetch accepts a local URI descriptor (the DOM declaration only knows Blob).
  form.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);
  return form;
}
