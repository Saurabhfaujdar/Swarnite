/**
 * File Upload / Download Routes
 * ─────────────────────────────
 * POST   /api/files/upload       — Upload one or more files (multipart/form-data)
 * GET    /api/files/:id          — Get attachment metadata
 * GET    /api/files/:id/url      — Get a time-limited signed download URL
 * GET    /api/files/download     — Download via signed URL (no auth required)
 * GET    /api/files/entity/:type/:id — List attachments for an entity
 * DELETE /api/files/:id          — Soft-delete an attachment
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { prisma } from '../prisma';
import { authenticate, tenantScope } from '../middleware/branchAccess';
import { storage, localDisk, verifySignature, generateStorageKey } from '../services/fileStorage';

const router = Router();

// ─── Multer config: memory storage, 10MB limit ────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
      'application/vnd.ms-excel', // xls
      'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});

// ─── Upload files ──────────────────────────────────────────
router.post(
  '/upload',
  authenticate,
  upload.array('files', 10),
  async (req: Request, res: Response) => {
    try {
      const { entityType, entityId, category } = req.body;

      if (!entityType || !entityId) {
        return res.status(400).json({ error: 'entityType and entityId are required' });
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files provided' });
      }

      const companyId = req.companyId!;
      const userId = req.userId!;
      const parsedEntityId = parseInt(entityId, 10);

      const attachments = await Promise.all(
        files.map(async (file) => {
          const key = generateStorageKey(companyId, entityType, parsedEntityId, file.originalname);
          await storage.put(file.buffer, key, file.mimetype);

          return prisma.attachment.create({
            data: {
              companyId,
              uploadedById: userId,
              entityType,
              entityId: parsedEntityId,
              originalName: file.originalname,
              storagePath: key,
              mimeType: file.mimetype,
              sizeBytes: file.size,
              category: category || 'document',
            },
          });
        })
      );

      res.status(201).json(attachments);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Upload failed' });
    }
  }
);

// ─── List attachments for an entity ────────────────────────
router.get('/entity/:type/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const type = req.params.type as string;
    const id = parseInt(req.params.id as string, 10);
    const attachments = await prisma.attachment.findMany({
      where: {
        ...tenantScope(req),
        entityType: type,
        entityId: id,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        category: true,
        createdAt: true,
        uploadedBy: { select: { fullName: true } },
      },
    });
    res.json(attachments);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get attachment metadata ───────────────────────────────
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const attachmentId = parseInt(req.params.id as string, 10);
    const attachment = await prisma.attachment.findFirst({
      where: { id: attachmentId, ...tenantScope(req), deletedAt: null },
      include: { uploadedBy: { select: { fullName: true } } },
    });
    if (!attachment) return res.status(404).json({ error: 'Attachment not found' });
    res.json(attachment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get signed download URL ───────────────────────────────
router.get('/:id/url', authenticate, async (req: Request, res: Response) => {
  try {
    const attachmentId = parseInt(req.params.id as string, 10);
    const attachment = await prisma.attachment.findFirst({
      where: { id: attachmentId, ...tenantScope(req), deletedAt: null },
    });
    if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

    const url = await storage.getSignedUrl(attachment.storagePath, 3600);
    res.json({ url, expiresIn: 3600 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Download via signed URL (no auth — URL is the credential) ─
router.get('/download', async (req: Request, res: Response) => {
  try {
    const { key, expires, sig } = req.query;

    if (!key || !expires || !sig) {
      return res.status(400).json({ error: 'Missing download parameters' });
    }

    const valid = verifySignature(
      key as string,
      parseInt(expires as string, 10),
      sig as string
    );

    if (!valid) {
      return res.status(403).json({ error: 'Invalid or expired download link' });
    }

    if (!localDisk) {
      // For S3 backend, getSignedUrl returns a direct S3 URL — client should use that directly
      return res.status(400).json({ error: 'Direct download not supported for S3 storage' });
    }

    const filePath = localDisk.getFilePath(key as string);
    res.sendFile(filePath);
  } catch (err: any) {
    res.status(404).json({ error: 'File not found' });
  }
});

// ─── Soft-delete an attachment ─────────────────────────────
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const attachmentId = parseInt(req.params.id as string, 10);
    const attachment = await prisma.attachment.findFirst({
      where: { id: attachmentId, ...tenantScope(req), deletedAt: null },
    });
    if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

    // Soft delete — keep file in storage for audit trail
    await prisma.attachment.update({
      where: { id: attachment.id },
      data: { deletedAt: new Date() },
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
