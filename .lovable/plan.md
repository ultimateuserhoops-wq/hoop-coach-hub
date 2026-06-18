
# Plan: True semantic RAG for the BDC Library

Upgrade from titles+descriptions to passage-level retrieval over the actual uploaded book content. Vietnamese UI preserved. kie.ai chat key untouched.

---

## 1. PDF/Text extraction

**Library:** `unpdf` (https://github.com/unjs/unpdf) — pure-JS port of pdf.js, zero native deps, runs in Deno/Workers/Node. This is the only PDF parser that reliably works in a Supabase Edge Function (Deno) runtime — `pdf-parse` needs Node fs, `pdfjs-dist` needs DOM polyfills, `pdf2json` spawns processes.

**Where it runs:** Supabase Edge Function `ingest-library-doc` (Deno). Frontend on Cloudflare Workers stays out of it — extraction is heavy and we want it server-side near the DB.

**Formats handled:**
- PDF → `unpdf.extractText()`
- `.txt`, `.md` → read bytes, decode UTF-8
- `.docx` → out of scope for v1 (call out to user; can add `mammoth` later if needed)

Strip headers/footers heuristically (drop lines repeated on >30% of pages), normalize whitespace.

---

## 2. Chunking

Token-aware splitter (~1000 tokens target, ~120 overlap), break on paragraph then sentence boundaries. Approx via `text.length / 4 ≈ tokens` to avoid bundling a tokenizer in the edge function.

Each chunk row stores:
- `document_id` → `library_documents.id` (FK, cascade delete)
- `chunk_index` (int)
- `content` (text, the passage)
- `source_title` (denormalized for cheap prompt injection)
- `token_estimate` (int)
- `embedding vector(N)` — N depends on §3

---

## 3. Embeddings — **DECISION NEEDED**

### Option A (recommended): Lovable AI Gateway embeddings — **no new key**
The project already has `LOVABLE_API_KEY` provisioned (visible in secrets). The gateway exposes `/v1/embeddings` with `google/gemini-embedding-001` (3072 dims) as default. This is in-stack, no extra paid key, no extra Settings field.

- Model: `google/gemini-embedding-001`
- Dim: **3072** → `vector(3072)` column
- Endpoint: `https://ai.gateway.lovable.dev/v1/embeddings` with header `Lovable-API-Key: $LOVABLE_API_KEY`
- Billed against Lovable Cloud credits (same bucket as any future Lovable AI usage)

### Option B (fallback): kie.ai `/embeddings`
Reuse the configured kie.ai key. Add `kie_ai_embedding_model` to `app_settings` (default e.g. `text-embedding-3-small`, 1536 dims). Risk: kie.ai's catalog and dimension for embeddings isn't documented in our context — could 404 or return a different size than we picked for the column.

### Option C: dedicated Supabase `gte-small` edge function
384 dims, free, fully local. But requires deploying the `embed` ML edge function which isn't in this project today and adds complexity.

**My recommendation: Option A.** It's free of new keys, highest quality of the three, fully in-stack, and the column dimension is fixed at 3072.

→ **Please confirm A, or pick B/C.** If B, also tell me the embedding model name you want defaulted.

---

## 4. Storage & search (Postgres + pgvector)

Migration (run after embedding choice is confirmed so dim is right):

```
create extension if not exists vector;

create table public.document_chunks (
  id uuid pk default gen_random_uuid(),
  document_id uuid not null references library_documents(id) on delete cascade,
  chunk_index int not null,
  source_title text not null,
  content text not null,
  token_estimate int not null,
  embedding vector(3072) not null,
  created_at timestamptz default now(),
  unique (document_id, chunk_index)
);

create index on public.document_chunks
  using hnsw (embedding vector_cosine_ops);
```

GRANTs: `select` to `authenticated` (coaches need it for retrieval via RLS-scoped client), `all` to `service_role`. RLS enabled; policy: authenticated users may read all chunks (library is shared coaching content, same as `library_documents` today).

RPC `match_document_chunks(query_embedding vector(3072), match_count int default 6, similarity_threshold float default 0.2)` returning `(document_id, source_title, content, similarity)` ordered by `1 - (embedding <=> query_embedding) desc`. SECURITY DEFINER, `search_path = public`.

Add to `library_documents`:
- `ingest_status text default 'pending'` — pending|processing|done|failed
- `ingest_error text`
- `chunk_count int default 0`
- `ingested_at timestamptz`

---

## 5. Ingestion pipeline (Edge Function)

**Edge Function `ingest-library-doc`** (Deno, `verify_jwt = true`):
- Input: `{ document_id }`
- Steps: load row → mark `processing` → download from `library` bucket via service role → extract text (unpdf or decode) → chunk → batch-embed (batches of 16, parallel limit 3) → bulk insert chunks → mark `done` with `chunk_count`. On error → `failed` + `ingest_error`.

**Trigger:** the Library upload flow (after the `insert` into `library_documents` succeeds) invokes the edge function via `supabase.functions.invoke('ingest-library-doc', { body: { document_id } })`. Fire-and-forget from client; status is reflected in the UI.

**Large-PDF / timeout safety:**
- Edge Function CPU wall clock cap is ~150s on Supabase. For a typical coaching book (200–400 pages) extraction+embedding fits, but to be safe:
  - Hard cap: skip extraction past 600 pages (mark `failed` with a Vietnamese message: "Tệp quá lớn, vui lòng tách nhỏ").
  - Process embeddings in batches with `await Promise.all` of small concurrency to avoid 429s.
  - If we hit the cap, the function self-reinvokes with `{ document_id, resume_from_chunk: N }` and the row stays `processing`. (Implements simple resumable queue without adding pg_cron / pgmq.)
- Re-index button in UI: deletes existing chunks for the doc, sets status back to `pending`, reinvokes the function.

**UI changes (Vietnamese, `library.tsx`):**
- Badge per card: "Đang xử lý…" (processing, spinner), "Sẵn sàng · N đoạn" (done), "Lỗi: …" (failed, red), "Chờ xử lý" (pending).
- Admin-only button "Lập lại chỉ mục" on each card.
- Realtime subscription on `library_documents` so status updates live.

---

## 6. Retrieval at generation time

Modify `src/lib/ai.functions.ts` `generateWithKieAi`:

1. Build a retrieval query string from `type + target + extraContext` (e.g. for curriculum: `"Giáo án bóng rổ trình độ Trung cấp. Ghi chú: <extra>"`).
2. Embed it with the same provider/model chosen in §3 (one helper `embedQuery(text)` reused by ingestion + retrieval).
3. Call `match_document_chunks(query_embedding, 6, 0.2)`.
4. Build context block:
   ```
   --- Trích đoạn tài liệu BDC ---
   [Nguồn: <source_title>]
   <content (trimmed)>
   ---
   ```
   Concatenate up to a token budget (~3500 tokens estimated by `len/4`), truncate the last passage if needed.
5. Replace the current titles+descriptions injection. If retrieval returns 0 hits above threshold, fall back to the current titles/descriptions list (so empty library or off-topic prompt still works).
6. Persist into `ai_generations`: existing `prompt` column will already include the injected passages — no schema change needed.

Token budget defaults sit in code (not Settings) for v1; easy to lift later.

---

## Technical notes / risks

- **3072-dim HNSW index size:** ~12 KB per vector. 10k chunks ≈ 120 MB — fine on Supabase. If you'd rather stay small, switch to Option B with `text-embedding-3-small` (1536) or Option C (384).
- **Cost shape:** embedding is one-shot per book (cheap), then per generation (1 query embed). Negligible vs chat.
- **Worker frontend:** unaffected — all extraction/embedding runs in the Supabase Edge Function, not in the Cloudflare Worker SSR.
- **kie.ai chat key:** untouched. Still placeholder, still surfaced in Settings.

---

## Decisions I need from you

1. **Embedding provider** — A (Lovable AI Gateway, `google/gemini-embedding-001`, 3072 dims, no new key) is my pick. Confirm, or choose B (kie.ai `/embeddings` + Settings field) or C (Supabase `gte-small`, 384 dims).
2. **DOCX support** — skip in v1, or add `mammoth`? (Adds ~200 KB to the edge function bundle.)
3. **Re-index existing library** — after deploy, auto-enqueue every existing `library_documents` row for ingestion, or only ingest newly-uploaded files?
