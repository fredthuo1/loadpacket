import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { validateFile, type UploadFile } from "./files";

export async function pickDocument(
  source: "camera" | "photo" | "file",
): Promise<UploadFile | null> {
  if (source === "file") {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/jpeg", "image/png"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    return validateFile({
      uri: asset.uri,
      name: asset.name,
      type: asset.mimeType ?? "",
      size: asset.size,
    });
  }
  const permission =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted)
    throw new Error(
      `${source === "camera" ? "Camera" : "Photo"} permission was denied. Enable it in device settings, or choose a file.`,
    );
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: 0.85,
    allowsEditing: false,
    allowsMultipleSelection: false,
  };
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  const asset = result.assets[0];
  const type =
    asset.mimeType ??
    (asset.uri.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");
  return validateFile({
    uri: asset.uri,
    name: asset.fileName ?? `paperwork.${type === "image/png" ? "png" : "jpg"}`,
    type,
    size: asset.fileSize,
  });
}
