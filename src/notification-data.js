export function commentRecipients(comment, entry, parent) {
  if (!entry || entry.status !== "published") return [];
  const recipients = new Map();
  if (parent?.entry_id === entry.id && parent.author_id !== comment.author_id)
    recipients.set(parent.author_id, "comment_reply");
  if (entry.author_id !== comment.author_id && !recipients.has(entry.author_id))
    recipients.set(entry.author_id, "entry_comment");
  return [...recipients].map(([recipient_id, kind]) => ({ recipient_id, kind }));
}

export function notificationPreview(comment) {
  const text = comment?.content?.trim().replace(/\s+/g, " ");
  return text ? text.slice(0, 160) + (text.length > 160 ? "…" : "")
    : comment?.image_asset_id ? "사진을 남겼어요." : "댓글을 확인해보세요.";
}
