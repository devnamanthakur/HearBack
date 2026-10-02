export const IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];
export const PDF_MIME = "application/pdf";
export const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const PDF_MAX_BYTES = 10 * 1024 * 1024;

// Attachments are stored inline (base64) in the topic document, and base64
// inflates by 4/3. MongoDB caps a document at 16 MB, so the *combined* raw
// size of an image + PDF must stay well under 12 MB (11 MB raw -> ~14.7 MB
// base64) or the insert fails. Keep this below PDF_MAX_BYTES + IMAGE_MAX_BYTES.
export const MAX_COMBINED_ATTACHMENT_BYTES = 11 * 1024 * 1024;

export interface AttachmentData {
  name: string;
  mime: string;
  data: string;
}

export interface FormPayload {
  fields: Record<string, string>;
  files: Record<string, File>;
}

export async function parseMultipartForm(
  request: Request,
): Promise<FormPayload> {
  const form = await request.formData();
  const fields: Record<string, string> = {};
  const files: Record<string, File> = {};

  form.forEach((value, key) => {
    if (typeof value === "string") {
      fields[key] = value;
    } else if (value instanceof File && value.size > 0) {
      files[key] = value;
    }
  });

  return { fields, files };
}

export async function fileToAttachment(
  file: File,
  maxBytes: number,
  allowedMimes: string[],
): Promise<AttachmentData | { error: string }> {
  if (file.size > maxBytes) {
    return {
      error: `File too large. Maximum allowed is ${Math.round(maxBytes / 1024 / 1024)} MB.`,
    };
  }
  if (!allowedMimes.includes(file.type)) {
    return { error: "Unsupported file type." };
  }
  const buffer = await file.arrayBuffer();
  const data = Buffer.from(buffer).toString("base64");
  return { name: file.name, mime: file.type, data };
}