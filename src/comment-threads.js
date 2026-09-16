// Keep logical reply depth unlimited without recursive rendering or traversal.
export function commentThreads(comments, entryId) {
  const ordered = comments.filter(c => c.entry_id === entryId).slice().sort(compareComments);
  const nodes = new Map(ordered.map(comment => [comment.id, { comment, children: [] }]));
  const roots = [];
  for (const node of nodes.values()) {
    const parent = nodes.get(node.comment.parent_id);
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  const visited = new Set(), threads = [];
  const walk = root => {
    if (visited.has(root.comment.id)) return;
    const thread = { root: root.comment, replies: [], latest: root.comment };
    const stack = [{ node: root, parent: null, depth: 0 }];
    while (stack.length) {
      const { node, parent, depth } = stack.pop();
      if (visited.has(node.comment.id)) continue;
      visited.add(node.comment.id);
      if (depth) thread.replies.push({ comment: node.comment, parent, depth });
      if (compareComments(thread.latest, node.comment) < 0) thread.latest = node.comment;
      for (let i = node.children.length - 1; i >= 0; i--)
        stack.push({ node: node.children[i], parent: node.comment, depth: depth + 1 });
    }
    threads.push(thread);
  };
  roots.forEach(walk);
  // Render even malformed imported demo data once, rather than hiding it or looping.
  nodes.forEach(walk);
  return threads;
}

export function compareComments(a, b) {
  return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
}
