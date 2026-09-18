import { createClient } from "@supabase/supabase-js";
import { makeSeed, DEMO_USER } from "./seed.js";
import { uuid, userError } from "./ui.js";
import { validateEntry } from "./validation.js";
import { commentRecipients } from "./notification-data.js";

const runtime = window.MILKTEA_CONFIG || {};
export const config = {
  url: import.meta.env.VITE_SUPABASE_URL || runtime.supabaseUrl || "",
  key:
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    runtime.publishableKey ||
    "",
};
function isPublicKey(key) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  try {
    return (
      JSON.parse(
        atob(key.split(".")[1].replaceAll("-", "+").replaceAll("_", "/")),
      ).role === "anon"
    );
  } catch {
    return false;
  }
}
export const configured =
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.url) &&
  isPublicKey(config.key);
// Admin invitation emails return an implicit session; app-initiated resets use PKCE.
const callbackHash = new URLSearchParams(window.location.hash.slice(1));
const invitationCallback =
  window.location.pathname.endsWith("/auth-callback.html") &&
  callbackHash.has("access_token") &&
  callbackHash.has("refresh_token");
export const client = configured
  ? createClient(config.url, config.key, {
      auth: {
        flowType: invitationCallback ? "implicit" : "pkce",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
const metadata =
  "id,author_id,diary_date,title,status,tags,version,created_at,updated_at,published_at";
const check = (response) => {
  if (response.error) throw response.error;
  return response.data;
};
async function all(build) {
  const result = [];
  for (let from = 0; ; from += 1000) {
    const data = check(await build().range(from, from + 999));
    result.push(...data);
    if (data.length < 1000) return result;
  }
}

export class CloudRepository {
  mode = "cloud";
  user = null;
  cache = new Map();
  async session() {
    const { session } = check(await client.auth.getSession());
    this.user = session?.user || null;
    return this.user;
  }
  async login(email, password) {
    const data = check(
      await client.auth.signInWithPassword({ email, password }),
    );
    this.user = data.user;
    return this.user;
  }
  async logout() {
    check(await client.auth.signOut());
    this.user = null;
    this.clearURLs();
  }
  async deleteAccount(password, confirmation) {
    const { data, error } = await client.functions.invoke("delete-account", {
      // Bind the confirmation screen to its account even if another tab changes the session.
      body: { password, confirmation, expected_user_id: this.user.id },
    });
    if (error) {
      let details;
      try { details = await error.context?.json(); } catch { /* Network or gateway error. */ }
      const failure = userError(details?.message ||
        "연결 문제로 삭제 완료 여부를 확인하지 못했어요. 잠시 후 다시 시도하거나 새로고침해 계정 상태를 확인해주세요.");
      failure.code = details?.code;
      throw failure;
    }
    if (!data?.deleted) throw userError("삭제가 완료되지 않았어요. 잠시 후 다시 시도해주세요.");
    await client.auth.signOut({ scope: "local" });
    this.user = null;
    this.clearURLs();
  }
  clearURLs() {
    for (const value of this.cache.values()) URL.revokeObjectURL(value);
    this.cache.clear();
  }
  async bootstrap() {
    const member = check(
      await client
        .from("members")
        .select("active")
        .eq("id", this.user.id)
        .maybeSingle(),
    );
    if (!member?.active) {
      if (check(await client.rpc("account_deletion_pending")))
        throw new Error("ACCOUNT_DELETION_PENDING");
      const { data, error } = await client.auth.getUser();
      if (!data?.user && [401, 403, 404].includes(error?.status)) {
        await client.auth.signOut({ scope: "local" });
        throw new Error("SESSION_ENDED");
      }
      throw new Error("MEMBER_REQUIRED");
    }
    const values = await Promise.all([
      all(() =>
        client.from("profiles").select("*").order("created_at").order("id"),
      ),
      client
        .from("user_preferences")
        .select("*")
        .eq("user_id", this.user.id)
        .single()
        .then(check),
      all(() =>
        client
          .from("habit_fields")
          .select("*")
          .eq("owner_id", this.user.id)
          .order("position")
          .order("id"),
      ),
      all(() =>
        client
          .from("diary_entries")
          .select(metadata)
          .order("diary_date", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id", { ascending: false }),
      ),
      all(() =>
        client
          .from("entry_reads")
          .select("*")
          .eq("user_id", this.user.id)
          .order("entry_id"),
      ),
      all(() =>
        client
          .from("media_assets")
          .select("*")
          .or(`owner_id.eq.${this.user.id},is_shared.eq.true`)
          .order("created_at")
          .order("id"),
      ),
    ]);
    return {
      profiles: values[0],
      preferences: values[1],
      habits: values[2],
      entries: values[3],
      reads: values[4],
      assets: values[5],
      isAdmin: check(await client.rpc("is_admin")),
    };
  }
  async invite(email, recovery = false) {
    const { data, error } = await client.functions.invoke("admin-invite", { body: { email, recovery } });
    if (error) {
      let details;
      try { details = await error.context?.json(); } catch { /* Gateway/network error. */ }
      throw userError(details?.message || "초대 링크를 만들지 못했어요. 잠시 후 다시 시도해주세요.");
    }
    return data;
  }
  async unreadNotifications() {
    const result = await client.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
    check(result);
    return result.count || 0;
  }
  async notifications({ unread = false, before = null } = {}) {
    let query = client.from("notifications")
      .select("*,actor:profiles!notifications_actor_id_fkey(*),entry:diary_entries(title,diary_date),comment:comments(content,image_asset_id)")
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(31);
    if (unread) query = query.is("read_at", null);
    if (before) query = query.or(`created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`);
    const rows = check(await query);
    return { items: rows.slice(0, 30), more: rows.length > 30 };
  }
  async markNotificationsRead(ids = null) {
    check(await client.rpc("mark_notifications_read", { p_ids: ids }));
  }
  async stickerPacks() {
    const [packs, items] = await Promise.all([
      all(() => client.from("sticker_packs").select("*").order("created_at").order("id")),
      all(() => client.from("sticker_pack_items").select("*").order("pack_id").order("position").order("asset_id")),
    ]);
    return packs.map(pack => ({ ...pack, asset_ids: items.filter(i => i.pack_id === pack.id).map(i => i.asset_id) }));
  }
  async saveStickerPack(pack) {
    return check(await client.rpc("save_sticker_pack", {
      p_id: pack.id || null, p_name: pack.name, p_assets: pack.asset_ids, p_cover: pack.cover_asset_id,
    }));
  }
  async deleteStickerPack(id) { check(await client.rpc("delete_sticker_pack", { p_id: id })); }
  async templates() {
    return all(() => client.from("diary_templates").select("*").order("created_at", { ascending: false }).order("id"));
  }
  async template(id) { return check(await client.from("diary_templates").select("*").eq("id", id).maybeSingle()); }
  async saveTemplate({ id, name, decoration }) {
    const query = id ? client.from("diary_templates").update({ name }).eq("id", id)
      : client.from("diary_templates").insert({ id: uuid(), name, decoration });
    return check(await query.select().single());
  }
  async deleteTemplate(id) { check(await client.from("diary_templates").delete().eq("id", id)); }
  async entries(ids) {
    if (!ids.length) return { entries: [], comments: [], reactions: [] };
    const values = await Promise.all([
      client.from("diary_entries").select("*").in("id", ids).then(check),
      all(() =>
        client
          .from("comments")
          .select("*")
          .in("entry_id", ids)
          .order("created_at")
          .order("id"),
      ),
      all(() =>
        client
          .from("reactions")
          .select("*")
          .in("entry_id", ids)
          .order("entry_id")
          .order("user_id")
          .order("emoji"),
      ),
    ]);
    return { entries: values[0], comments: values[1], reactions: values[2] };
  }
  async entry(id) {
    return check(
      await client.from("diary_entries").select("*").eq("id", id).maybeSingle(),
    );
  }
  async saveEntry(entry) {
    validateEntry(entry);
    return check(
      await client.rpc("save_entry", {
        p_id: entry.id,
        p_expected_version: entry.version || 0,
        p_date: entry.diary_date,
        p_title: entry.title,
        p_status: entry.status,
        p_tags: entry.tags,
        p_document: entry.document,
      }),
    );
  }
  async deleteEntry(id) {
    const data = check(
      await client
        .from("diary_entries")
        .delete()
        .eq("id", id)
        .eq("author_id", this.user.id)
        .select("id"),
    );
    if (!data.length) throw new Error("FORBIDDEN");
  }
  async saveComment({ id, entry_id, content, image_asset_id, parent_id = null }) {
    if (!content.trim() && !image_asset_id)
      throw userError("댓글이나 사진을 추가해주세요.");
    if (id) {
      const data = check(
        await client
          .from("comments")
          .update({ content, image_asset_id })
          .eq("id", id)
          .eq("author_id", this.user.id)
          .select()
          .single(),
      );
      return data;
    }
    return check(
      await client
        .from("comments")
        .insert({
          id: uuid(),
          entry_id,
          author_id: this.user.id,
          content,
          image_asset_id,
          parent_id,
        })
        .select()
        .single(),
    );
  }
  async deleteComment(id) {
    const rows = check(
      await client.from("comments").delete().eq("id", id).select("id"),
    );
    if (!rows.length) throw new Error("FORBIDDEN");
  }
  async toggleReaction(entry_id, emoji, remove) {
    check(
      await (remove
        ? client
            .from("reactions")
            .delete()
            .match({ entry_id, user_id: this.user.id, emoji })
        : client
            .from("reactions")
            .insert({ entry_id, user_id: this.user.id, emoji })),
    );
  }
  async markRead(entry_id) {
    check(await client.rpc("mark_entry_read", { p_entry_id: entry_id }));
  }
  async saveProfile(patch) {
    return check(
      await client
        .from("profiles")
        .update(patch)
        .eq("id", this.user.id)
        .select()
        .single(),
    );
  }
  async savePreferences(patch) {
    return check(
      await client
        .from("user_preferences")
        .update(patch)
        .eq("user_id", this.user.id)
        .select()
        .single(),
    );
  }
  async saveHabit(habit) {
    if (habit.id)
      return check(
        await client
          .from("habit_fields")
          .update({
            name: habit.name,
            unit: habit.unit,
            position: habit.position,
            archived: habit.archived,
          })
          .eq("id", habit.id)
          .eq("owner_id", this.user.id)
          .select()
          .single(),
      );
    return check(
      await client
        .from("habit_fields")
        .insert({ ...habit, id: uuid(), owner_id: this.user.id })
        .select()
        .single(),
    );
  }
  async upload(
    blob,
    { kind, name, mime = blob.type, extension, shared = false },
  ) {
    const id = uuid();
    const bucket = {
      avatar: "avatars",
      "diary-image": "diary-images",
      "comment-image": "diary-images",
      sticker: "stickers",
      background: "backgrounds",
      font: "fonts",
    }[kind];
    const path = `${this.user.id}/${id}.${extension}`;
    check(
      await client.storage
        .from(bucket)
        .upload(path, blob, { contentType: mime, upsert: false }),
    );
    const asset = {
      id,
      owner_id: this.user.id,
      kind,
      bucket_id: bucket,
      object_path: path,
      name: name.slice(0, 100) || "첨부 파일",
      mime_type: mime,
      byte_size: blob.size,
      is_shared:
        shared === true && ["sticker", "background", "font"].includes(kind),
    };
    const response = await client
      .from("media_assets")
      .insert(asset)
      .select()
      .single();
    if (response.error) {
      await client.storage.from(bucket).remove([path]);
      throw response.error;
    }
    return response.data;
  }
  async asset(id) {
    return check(
      await client.from("media_assets").select("*").eq("id", id).maybeSingle(),
    );
  }
  async assetURL(id) {
    if (!id) return "";
    if (this.cache.has(id)) return this.cache.get(id);
    const asset = await this.asset(id);
    if (!asset) return "";
    const blob = check(
      await client.storage.from(asset.bucket_id).download(asset.object_path),
    );
    const url = URL.createObjectURL(blob);
    this.cache.set(id, url);
    return url;
  }
  async archiveAsset(id, archived = true) {
    check(
      await client
        .from("media_assets")
        .update({ archived })
        .eq("id", id)
        .eq("owner_id", this.user.id),
    );
  }
}

let dbPromise;
function db() {
  if (!dbPromise)
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open("milktea-demo-v1", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("state");
        request.result.createObjectStore("blobs");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(
          userError(
            "브라우저 저장 공간을 열 수 없어요. 일반 브라우저 창에서 다시 열어주세요.",
          ),
        );
    });
  return dbPromise;
}
async function read(store, key) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction(store).objectStore(store).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function mutate(fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction("state", "readwrite");
    const store = t.objectStore("state");
    const req = store.get("data");
    let result;
    req.onsuccess = () => {
      try {
        const data = req.result || makeSeed();
        result = fn(data);
        store.put(data, "data");
      } catch (e) {
        reject(e);
        t.abort();
      }
    };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
  });
}
async function putBlob(id, blob) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction("blobs", "readwrite");
    t.objectStore("blobs").put(blob, id);
    t.oncomplete = resolve;
    t.onerror = () =>
      reject(
        userError(
          "브라우저 저장 공간이 부족해요. 더 작은 파일을 선택해주세요.",
        ),
      );
  });
}
const owned = (record, user) => {
  if (!record || record.author_id !== user) throw new Error("FORBIDDEN");
};
export class DemoRepository {
  mode = "demo";
  user = { id: DEMO_USER, email: "체험 계정" };
  cache = new Map();
  async session() {
    return this.user;
  }
  async logout() {
    sessionStorage.removeItem("milktea-demo");
    this.clearURLs();
  }
  clearURLs() {
    for (const value of this.cache.values()) URL.revokeObjectURL(value);
    this.cache.clear();
  }
  async data() {
    if (!(await read("state", "data"))) await mutate(() => {});
    const current = await read("state", "data");
    if (!current.notifications) await mutate(d => {
      const migratedAt = new Date().toISOString();
      d.notifications = d.comments.flatMap(c => commentRecipients(c,
        d.entries.find(x => x.id === c.entry_id), d.comments.find(x => x.id === c.parent_id),
      ).map(recipient => ({ id: uuid(), ...recipient, actor_id: c.author_id,
        entry_id: c.entry_id, comment_id: c.id, created_at: c.created_at, read_at: migratedAt })));
    });
    return read("state", "data");
  }
  async notificationRows() {
    const d = await this.data();
    return d.notifications.filter(n => n.recipient_id === this.user.id &&
      d.entries.some(e => e.id === n.entry_id && e.status === "published") &&
      d.comments.some(c => c.id === n.comment_id) && d.profiles.some(p => p.id === n.actor_id))
      .map(n => ({ ...n, actor: d.profiles.find(p => p.id === n.actor_id),
        entry: d.entries.find(e => e.id === n.entry_id), comment: d.comments.find(c => c.id === n.comment_id) }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  }
  async unreadNotifications() { return (await this.notificationRows()).filter(n => !n.read_at).length; }
  async notifications({ unread = false, before = null } = {}) {
    const rows = (await this.notificationRows()).filter(n => (!unread || !n.read_at) &&
      (!before || n.created_at < before.created_at || n.created_at === before.created_at && n.id < before.id));
    return { items: structuredClone(rows.slice(0, 30)), more: rows.length > 30 };
  }
  async markNotificationsRead(ids = null) {
    await this.data();
    return mutate(d => {
      for (const n of d.notifications) if (n.recipient_id === this.user.id && !n.read_at &&
        (!ids || ids.includes(n.id))) n.read_at = new Date().toISOString();
    });
  }
  async bootstrap() {
    const d = await this.data();
    return structuredClone({
      profiles: d.profiles,
      preferences: d.preferences,
      habits: d.habits,
      entries: d.entries
        .filter((x) => x.status === "published" || x.author_id === this.user.id)
        .map(({ document, ...entry }) => entry),
      reads: d.reads,
      assets: d.assets.filter(
        (x) => x.owner_id === this.user.id || x.is_shared,
      ),
      isAdmin: false,
    });
  }
  async stickerPacks() { return structuredClone((await this.data()).stickerPacks || []); }
  async templates() { return structuredClone((await this.data()).templates || []); }
  async template(id) { return (await this.templates()).find(t => t.id === id) || null; }
  async saveTemplate({ id, name, decoration }) {
    return mutate(d => {
      d.templates ||= [];
      const existing = d.templates.find(t => t.id === id);
      if (id && !existing) throw new Error("TEMPLATE_UNAVAILABLE");
      if (existing) existing.name = name;
      else d.templates.unshift({ id: uuid(), owner_id: this.user.id, name, decoration: structuredClone(decoration), created_at: new Date().toISOString() });
      return structuredClone(existing || d.templates[0]);
    });
  }
  async deleteTemplate(id) { return mutate(d => { d.templates = (d.templates || []).filter(t => t.id !== id); }); }
  async entries(ids) {
    const d = await this.data();
    return structuredClone({
      entries: d.entries.filter(
        (x) =>
          ids.includes(x.id) &&
          (x.status === "published" || x.author_id === this.user.id),
      ),
      comments: d.comments.filter((x) => ids.includes(x.entry_id)),
      reactions: d.reactions.filter((x) => ids.includes(x.entry_id)),
    });
  }
  async entry(id) {
    const d = await this.data();
    return structuredClone(
      d.entries.find(
        (x) =>
          x.id === id &&
          (x.status === "published" || x.author_id === this.user.id),
      ) || null,
    );
  }
  async saveEntry(entry) {
    validateEntry(entry);
    return mutate((d) => {
      const now = new Date().toISOString();
      const existing = d.entries.find((x) => x.id === entry.id);
      if (existing) owned(existing, this.user.id);
      if (existing?.version !== (entry.version || undefined))
        throw new Error("ENTRY_CHANGED_OR_UNAVAILABLE");
      const value = {
        ...structuredClone(entry),
        author_id: this.user.id,
        version: (existing?.version || 0) + 1,
        created_at: existing?.created_at || now,
        updated_at: now,
        published_at:
          existing?.published_at || (entry.status === "published" ? now : null),
      };
      if (existing) d.entries[d.entries.indexOf(existing)] = value;
      else d.entries.push(value);
      return structuredClone(value);
    });
  }
  async deleteEntry(id) {
    return mutate((d) => {
      owned(
        d.entries.find((x) => x.id === id),
        this.user.id,
      );
      d.entries = d.entries.filter((x) => x.id !== id);
      d.comments = d.comments.filter((x) => x.entry_id !== id);
      d.reactions = d.reactions.filter((x) => x.entry_id !== id);
      d.reads = d.reads.filter((x) => x.entry_id !== id);
    });
  }
  async saveComment(comment) {
    return mutate((d) => {
      const parent = d.entries.find((x) => x.id === comment.entry_id);
      if (parent?.status !== "published") throw new Error("FORBIDDEN");
      if (!comment.content.trim() && !comment.image_asset_id)
        throw userError("댓글이나 사진을 추가해주세요.");
      if (comment.content.length > 2000)
        throw userError("댓글은 2,000자까지 쓸 수 있어요.");
      const old = d.comments.find((x) => x.id === comment.id);
      if (old) owned(old, this.user.id);
      if (!old && comment.parent_id && !d.comments.some(
        x => x.id === comment.parent_id && x.entry_id === comment.entry_id,
      )) throw new Error("COMMENT_PARENT_UNAVAILABLE");
      const now = new Date().toISOString();
      const value = {
        ...comment,
        id: old?.id || uuid(),
        author_id: this.user.id,
        entry_id: old?.entry_id || comment.entry_id,
        parent_id: old ? old.parent_id || null : comment.parent_id || null,
        parent_deleted: old?.parent_deleted || false,
        created_at: old?.created_at || now,
        updated_at: now,
      };
      if (old) d.comments[d.comments.indexOf(old)] = value;
      else {
        d.comments.push(value);
        d.notifications ||= [];
        for (const recipient of commentRecipients(value, parent, d.comments.find(c => c.id === value.parent_id)))
          d.notifications.push({ id: uuid(), ...recipient, actor_id: value.author_id,
            entry_id: value.entry_id, comment_id: value.id, created_at: now, read_at: null });
      }
      return value;
    });
  }
  async deleteComment(id) {
    return mutate((d) => {
      const c = d.comments.find((x) => x.id === id);
      if (
        !c ||
        (c.author_id !== this.user.id &&
          d.entries.find((x) => x.id === c.entry_id)?.author_id !==
            this.user.id)
      )
        throw new Error("FORBIDDEN");
      d.comments = d.comments.filter((x) => x.id !== id);
      for (const reply of d.comments) if (reply.parent_id === id) {
        reply.parent_id = null;
        reply.parent_deleted = true;
      }
    });
  }
  async toggleReaction(entry_id, emoji, remove) {
    return mutate((d) => {
      if (d.entries.find((x) => x.id === entry_id)?.status !== "published")
        throw new Error("FORBIDDEN");
      d.reactions = d.reactions.filter(
        (x) =>
          !(
            x.entry_id === entry_id &&
            x.user_id === this.user.id &&
            x.emoji === emoji
          ),
      );
      if (!remove) d.reactions.push({ entry_id, user_id: this.user.id, emoji });
    });
  }
  async markRead(entry_id) {
    return mutate((d) => {
      d.reads = d.reads.filter((x) => x.entry_id !== entry_id);
      d.reads.push({
        entry_id,
        user_id: this.user.id,
        last_read_at: new Date().toISOString(),
      });
    });
  }
  async saveProfile(patch) {
    return mutate((d) => {
      const p = d.profiles.find((x) => x.id === this.user.id);
      Object.assign(p, patch);
      return p;
    });
  }
  async savePreferences(patch) {
    return mutate((d) => Object.assign(d.preferences, patch));
  }
  async saveHabit(habit) {
    return mutate((d) => {
      if (habit.id) {
        const h = d.habits.find(
          (x) => x.id === habit.id && x.owner_id === this.user.id,
        );
        if (!h) throw new Error("FORBIDDEN");
        Object.assign(h, habit);
        return h;
      }
      const h = {
        ...habit,
        id: uuid(),
        owner_id: this.user.id,
        archived: false,
      };
      d.habits.push(h);
      return h;
    });
  }
  async upload(
    blob,
    { kind, name, mime = blob.type, extension, shared = false },
  ) {
    const id = uuid();
    await putBlob(id, blob);
    const asset = {
      id,
      owner_id: this.user.id,
      kind,
      name: name.slice(0, 100) || "첨부 파일",
      mime_type: mime,
      byte_size: blob.size,
      is_shared:
        shared === true && ["sticker", "background", "font"].includes(kind),
      archived: false,
      created_at: new Date().toISOString(),
      object_path: `${this.user.id}/${id}.${extension}`,
    };
    await mutate((d) => d.assets.push(asset));
    return asset;
  }
  async asset(id) {
    const d = await this.data();
    return d.assets.find((x) => x.id === id) || null;
  }
  async assetURL(id) {
    if (!id) return "";
    if (this.cache.has(id)) return this.cache.get(id);
    const blob = await read("blobs", id);
    if (!blob) return "";
    const url = URL.createObjectURL(blob);
    this.cache.set(id, url);
    return url;
  }
  async archiveAsset(id, archived = true) {
    return mutate((d) => {
      const a = d.assets.find(
        (x) => x.id === id && x.owner_id === this.user.id,
      );
      if (!a) throw new Error("FORBIDDEN");
      a.archived = archived;
    });
  }
}
