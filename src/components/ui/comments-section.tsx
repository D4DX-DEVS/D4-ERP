"use client";

import * as React from "react";
import { Send, Paperclip, Loader2 } from "lucide-react";
import { createDocument, getDocuments, orderBy, where, Timestamp } from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";
import { FileUpload } from "@/components/ui/file-upload";
import type { Comment, CommentEntityType } from "@/types";

interface CommentsSectionProps {
  entityType: CommentEntityType;
  entityId: string;
  className?: string;
}

export function CommentsSection({ entityType, entityId, className }: CommentsSectionProps) {
  const { user } = useAuthStore();
  const [comments, setComments] = React.useState<Comment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [text, setText] = React.useState("");
  const [showAttachment, setShowAttachment] = React.useState(false);
  const [attachmentUrl, setAttachmentUrl] = React.useState("");
  const [attachmentMeta, setAttachmentMeta] = React.useState<{ name: string; size: number } | null>(null);

  const fetchComments = React.useCallback(async () => {
    try {
      const docs = await getDocuments<Comment>("comments", [
        where("entityType", "==", entityType),
        where("entityId", "==", entityId),
        orderBy("createdAt", "asc"),
      ]);
      setComments(docs);
    } catch (error) {
      console.error("Failed to load comments:", error);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  React.useEffect(() => {
    void fetchComments();
  }, [fetchComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !user) return;

    setSubmitting(true);
    try {
      const attachments = attachmentUrl && attachmentMeta
        ? [{ name: attachmentMeta.name, url: attachmentUrl, type: "file", size: attachmentMeta.size }]
        : undefined;

      await createDocument("comments", {
        entityType,
        entityId,
        text: text.trim(),
        authorId: user.uid,
        authorName: `${user.firstName} ${user.lastName}`,
        attachments: attachments || [],
        createdAt: Timestamp.now(),
      });

      setText("");
      setAttachmentUrl("");
      setAttachmentMeta(null);
      setShowAttachment(false);
      await fetchComments();
    } catch (error) {
      console.error("Failed to post comment:", error);
    } finally {
      setSubmitting(false);
    }
  };

  function formatTime(ts: { seconds: number } | undefined): string {
    if (!ts) return "";
    const d = new Date(ts.seconds * 1000);
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className={className}>
      <h4 className="text-sm font-medium mb-3">Comments</h4>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-3">No comments yet.</p>
      ) : (
        <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
          {comments.map((c) => (
            <div key={c.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{c.authorName}</span>
                <span className="text-xs text-muted-foreground">
                  {formatTime(c.createdAt)}
                </span>
              </div>
              <p className="text-sm text-foreground">{c.text}</p>
              {c.attachments && c.attachments.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.attachments.map((att, i) => (
                    <a
                      key={i}
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary underline"
                    >
                      {att.name}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {user && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write a comment..."
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={submitting}
            />
            <button
              type="button"
              onClick={() => setShowAttachment(!showAttachment)}
              className="rounded-md border border-input p-2 hover:bg-accent"
              title="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              type="submit"
              disabled={!text.trim() || submitting}
              className="rounded-md bg-primary px-3 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          {showAttachment && (
            <FileUpload
              value={attachmentUrl}
              onChange={(url, meta) => {
                setAttachmentUrl(url);
                if (meta) setAttachmentMeta(meta);
              }}
              folder="misc"
              accept="*/*"
              preview="document"
            />
          )}
        </form>
      )}
    </div>
  );
}
