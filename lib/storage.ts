import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export function storageConfigured() {
  const key = process.env.R2_ACCESS_KEY_ID;
  const secret = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_PRIVATE;
  const endpoint = storageEndpoint();
  return Boolean(key && secret && bucket && endpoint);
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

export async function putPrivateObject(key: string, body: Buffer, contentType: string) {
  await client().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_PRIVATE,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function readPrivateObject(key: string) {
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
