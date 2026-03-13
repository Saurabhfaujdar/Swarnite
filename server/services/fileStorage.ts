/**
 * File Storage Service
 * ────────────────────
 * Abstraction over file storage backends.
 *
 * Development / single-server: local disk (uploads/ directory)
 * Production:                  S3-compatible (AWS S3, Minio, DigitalOcean Spaces)
 *
 * Usage:
 *   import { storage } from '../services/fileStorage';
 *   const key = await storage.put(buffer, 'invoices/123/receipt.pdf', 'application/pdf');
 *   const url = await storage.getSignedUrl(key);   // time-limited URL
 *   await storage.delete(key);
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config';

// ─── Interface ─────────────────────────────────────────────

export interface FileStorageBackend {
  /** Store a file and return its storage key */
  put(buffer: Buffer, key: string, mimeType: string): Promise<string>;
  /** Generate a time-limited URL (or local path) for downloading */
  getSignedUrl(key: string, expiresInSec?: number): Promise<string>;
  /** Delete a file by key */
  delete(key: string): Promise<void>;
  /** Check if a file exists */
  exists(key: string): Promise<boolean>;
}

// ─── Local Disk Backend (development / single-server) ──────

class LocalDiskStorage implements FileStorageBackend {
  private basePath: string;
  private urlPrefix: string;

  constructor() {
    this.basePath = path.resolve(process.env.UPLOAD_DIR || 'uploads');
    this.urlPrefix = '/api/files/download';

    // Ensure the uploads directory exists
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }

  async put(buffer: Buffer, key: string, _mimeType: string): Promise<string> {
    const filePath = path.join(this.basePath, key);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, buffer);
    return key;
  }

  async getSignedUrl(key: string, expiresInSec = 3600): Promise<string> {
    // For local storage, create a signed token the server can verify
    const expires = Math.floor(Date.now() / 1000) + expiresInSec;
    const signature = createSignature(key, expires);
    return `${this.urlPrefix}?key=${encodeURIComponent(key)}&expires=${expires}&sig=${signature}`;
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.basePath, key);
    const resolved = path.resolve(filePath);
    // Prevent path traversal
    if (!resolved.startsWith(path.resolve(this.basePath))) {
      throw new Error('Invalid file path');
    }
    if (fs.existsSync(resolved)) {
      fs.unlinkSync(resolved);
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = path.join(this.basePath, key);
    return fs.existsSync(filePath);
  }

  /** Read file from disk (used by download endpoint) */
  getFilePath(key: string): string {
    const filePath = path.join(this.basePath, key);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(this.basePath))) {
      throw new Error('Invalid file path');
    }
    return resolved;
  }
}

// ─── S3 Backend (production stub — implement with @aws-sdk/client-s3) ──

class S3Storage implements FileStorageBackend {
  // In production, this would use @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner.
  // This stub demonstrates the interface; replace with real implementation
  // when adding the S3 SDK to dependencies.
  //
  // Required env vars:
  //   S3_BUCKET, S3_REGION, S3_ENDPOINT (for Minio),
  //   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY

  async put(_buffer: Buffer, key: string, _mimeType: string): Promise<string> {
    // const command = new PutObjectCommand({
    //   Bucket: process.env.S3_BUCKET!,
    //   Key: key,
    //   Body: buffer,
    //   ContentType: mimeType,
    // });
    // await s3Client.send(command);
    throw new Error(
      'S3 storage not yet configured. Install @aws-sdk/client-s3 and implement.'
    );
    return key;
  }

  async getSignedUrl(key: string, expiresInSec = 3600): Promise<string> {
    // const command = new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key });
    // return getSignedUrl(s3Client, command, { expiresIn: expiresInSec });
    throw new Error('S3 storage not yet configured.');
    return '';
  }

  async delete(key: string): Promise<void> {
    // const command = new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key });
    // await s3Client.send(command);
    throw new Error('S3 storage not yet configured.');
  }

  async exists(_key: string): Promise<boolean> {
    throw new Error('S3 storage not yet configured.');
  }
}

// ─── Signed URL helper (HMAC-based, for local storage) ─────

function createSignature(key: string, expires: number): string {
  const data = `${key}:${expires}`;
  return crypto
    .createHmac('sha256', config.jwtSecret)
    .update(data)
    .digest('hex');
}

export function verifySignature(key: string, expires: number, sig: string): boolean {
  if (Math.floor(Date.now() / 1000) > expires) return false; // expired
  const expected = createSignature(key, expires);
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

// ─── Factory ───────────────────────────────────────────────

function createStorage(): FileStorageBackend {
  const backend = process.env.STORAGE_BACKEND || 'local';
  if (backend === 's3') return new S3Storage();
  return new LocalDiskStorage();
}

export const storage = createStorage();

// Export class for download endpoint to access getFilePath
export const localDisk =
  storage instanceof LocalDiskStorage ? storage : null;

// ─── Key generation helper ─────────────────────────────────

/** Generate a unique storage key: companyId/entityType/entityId/uuid-filename */
export function generateStorageKey(
  companyId: number,
  entityType: string,
  entityId: number,
  originalName: string
): string {
  const uuid = crypto.randomUUID();
  const ext = path.extname(originalName);
  const safeName = path.basename(originalName, ext)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 50);
  return `${companyId}/${entityType}/${entityId}/${uuid}-${safeName}${ext}`;
}
