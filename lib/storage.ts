import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

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
  return new S3Client({
    region: "auto",
    endpoint: storageEndpoint(),
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    },
  });
}

function localPaths(key: string) {
  const safe = key.split("/").filter((part) => part && part !== "." && part !== "..");
  const filePath = path.join(process.cwd(), ".data", "storage", ...safe);
  return { filePath, metaPath: `${filePath}.meta.json` };
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
    const result = await client().send(
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_PRIVATE,
        Key: key,
      }),
    );
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) return null;
    return { bytes, contentType: result.ContentType ?? "application/octet-stream" };
  }
  const { filePath, metaPath } = localPaths(key);
  if (!existsSync(filePath)) return null;
  const bytes = new Uint8Array(readFileSync(filePath));
  let contentType = "application/octet-stream";
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf8")) as { contentType?: string };
      if (meta.contentType) contentType = meta.contentType;
    } catch {
      // ignore invalid metadata
    }
  }
  return { bytes, contentType };
}
