// lib/s3-client.ts
import { S3Client } from "@aws-sdk/client-s3";

if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
  console.warn("⚠️ Missing Cloudflare R2 credentials in environment variables.");
}

export const s3Client = new S3Client({
  region: "auto", // Cloudflare dynamically routes to the closest region
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
  forcePathStyle: true, // Forces Cloudflare R2 compatibility
});

export const BUCKET_NAME = process.env.R2_BUCKET_NAME || "fyp-portal";

// 9.5 GB limit (Leaves a 500MB safety buffer before the 10GB free tier billing threshold)
export const MAX_STORAGE_BYTES = 9.5 * 1024 * 1024 * 1024;