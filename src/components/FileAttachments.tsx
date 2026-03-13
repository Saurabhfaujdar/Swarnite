import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { filesAPI } from '../lib/api';
import toast from 'react-hot-toast';

interface FileAttachmentsProps {
  entityType: string; // "SalesVoucher", "PurchaseVoucher", "Account", etc.
  entityId: number;
  category?: string;
  readOnly?: boolean;
}

interface AttachmentItem {
  id: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  createdAt: string;
  uploadedBy: { fullName: string };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileAttachments({ entityType, entityId, category, readOnly }: FileAttachmentsProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const queryKey = ['attachments', entityType, entityId];

  const { data: attachments = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => filesAPI.list(entityType, entityId).then((r) => r.data as AttachmentItem[]),
    enabled: entityId > 0,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => filesAPI.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('File removed');
    },
    onError: () => toast.error('Failed to remove file'),
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    try {
      await filesAPI.upload(entityType, entityId, files, category);
      queryClient.invalidateQueries({ queryKey });
      toast.success(`${files.length} file(s) uploaded`);
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (att: AttachmentItem) => {
    try {
      const { data } = await filesAPI.getDownloadUrl(att.id);
      window.open(data.url, '_blank');
    } catch {
      toast.error('Failed to get download link');
    }
  };

  const mimeIcon = (mime: string) => {
    if (mime.startsWith('image/')) return '🖼️';
    if (mime === 'application/pdf') return '📄';
    if (mime.includes('spreadsheet') || mime.includes('excel') || mime === 'text/csv') return '📊';
    return '📎';
  };

  return (
    <div className="space-y-2">
      {/* Upload bar */}
      {!readOnly && (
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.xlsx,.xls,.csv,.doc,.docx"
            onChange={handleUpload}
            className="hidden"
          />
          <button
            type="button"
            className="btn-outline text-xs px-3 py-1.5"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? '⏳ Uploading...' : '📤 Attach File'}
          </button>
          <span className="text-xs text-gray-400">Max 10 MB per file</span>
        </div>
      )}

      {/* File list */}
      {isLoading && <div className="text-xs text-gray-400">Loading attachments...</div>}

      {attachments.length > 0 && (
        <ul className="divide-y divide-gray-100 border rounded text-sm">
          {attachments.map((att) => (
            <li key={att.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
              <span>{mimeIcon(att.mimeType)}</span>
              <button
                type="button"
                onClick={() => handleDownload(att)}
                className="text-blue-600 hover:underline truncate flex-1 text-left"
                title={att.originalName}
              >
                {att.originalName}
              </button>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {formatFileSize(att.sizeBytes)}
              </span>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {att.uploadedBy.fullName}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Remove "${att.originalName}"?`)) {
                      deleteMutation.mutate(att.id);
                    }
                  }}
                  className="text-red-400 hover:text-red-600 text-xs"
                  title="Remove"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
