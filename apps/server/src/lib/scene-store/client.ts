import { env } from "@OpenDiagram/env/server";
import { S3Client } from "bun";

// Credentials passed explicitly rather than left to Bun's implicit S3_* lookup,
// so typed env stays the one place config is validated.
export const store = new S3Client({
  endpoint: env.S3_ENDPOINT,
  bucket: env.S3_BUCKET,
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
});
