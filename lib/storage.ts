import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

let cachedClient: S3Client | null = null;

export function r2Configured() {
  const key = process.env.R2_ACCESS_KEY_ID;
  const secret = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_PRIVATE;
  const endpoint = storageEndpoint();
  return Boolean(key && secret && bucket && endpoint);
}

export function storageConfigured() {
  return r2Configured() || process.env.NODE_ENV !== "production";
}

function storageEndpoint() {
  if (process.env.R2_ENDPOINT) return process.env.R2_ENDPOINT;
  if (process.env.R2_ACCOUNT_ID) return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  return "";
}

function client() {
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: storageEndpoint(),
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  return cachedClient;
}

function localPaths(key: string) {
  const safe = key.split("/").filter((part) => part && part !== "." && part !== "..");
  const filePath = path.join(process.cwd(), ".data", "storage", ...safe);
  return { filePath, metaPath: `${filePath}.meta.json` };
}

export function detectAllowedFileType(bytes: Buffer, allowed: Set<string>): string | null {
  if (bytes.length < 4) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && allowed.has("image/jpeg")) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    allowed.has("image/png")
  ) {
    return "image/png";
  }
  // WEBP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP" &&
    allowed.has("image/webp")
  ) {
    return "image/webp";
  }
  // PDF: %PDF
  if (bytes.subarray(0, 4).toString("ascii") === "%PDF" && allowed.has("application/pdf")) {
    return "application/pdf";
  }
  return null;
}

export async function putPrivateObject(key: string, body: Buffer, contentType: string) {
  if (r2Configured()) {
    await client().send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_PRIVATE,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return;
  }
  const { filePath, metaPath } = localPaths(key);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, body);
  writeFileSync(metaPath, JSON.stringify({ contentType }));
}

export async function readPrivateObject(key: string) {
  if (r2Configured()) {
    try {
      const result = await client().send(
        new GetObjectCommand({
          Bucket: process.env.R2_BUCKET_PRIVATE,
          Key: key,
        }),
      );
      const bytes = await result.Body?.transformToByteArray();
      if (!bytes) return null;
      return { bytes, contentType: result.ContentType ?? "application/octet-stream" };
    } catch {
      return null;
    }
  }
  const { filePath, metaPath } = localPaths(key);
  if (!existsSync(/*turbopackIgnore: true*/ filePath)) return null;
  const bytes = new Uint8Array(readFileSync(/*turbopackIgnore: true*/ filePath));
  let contentType = "application/octet-stream";
  if (existsSync(/*turbopackIgnore: true*/ metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(/*turbopackIgnore: true*/ metaPath, "utf8")) as { contentType?: string };
      if (meta.contentType) contentType = meta.contentType;
    } catch {
      // ignore invalid metadata
    }
  }
  return { bytes, contentType };
}
