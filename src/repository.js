import { createClient } from "@supabase/supabase-js";
import { makeSeed, DEMO_USER } from "./seed.js";
import { uuid, userError } from "./ui.js";
import { validateEntry } from "./validation.js";

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
export const client = configured
  ? createClient(config.url, config.key, {
      auth: {
        flowType: "pkce",
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
    if (!member?.active) throw new Error("MEMBER_REQUIRED");
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
    };
  }
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
  async saveComment({ id, entry_id, content, image_asset_id }) {
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
    return read("state", "data");
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
    });
  }
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
      const now = new Date().toISOString();
      const value = {
        ...comment,
        id: old?.id || uuid(),
        author_id: this.user.id,
        created_at: old?.created_at || now,
        updated_at: now,
      };
      if (old) d.comments[d.comments.indexOf(old)] = value;
      else d.comments.push(value);
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
