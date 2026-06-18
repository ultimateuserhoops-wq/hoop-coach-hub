
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.library_documents
  ADD COLUMN IF NOT EXISTS ingest_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ingest_error text,
  ADD COLUMN IF NOT EXISTS chunk_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ingested_at timestamptz;

CREATE TABLE IF NOT EXISTS public.document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.library_documents(id) ON DELETE CASCADE,
  chunk_index int NOT NULL,
  source_title text NOT NULL,
  content text NOT NULL,
  token_estimate int NOT NULL DEFAULT 0,
  embedding vector(1536) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

GRANT SELECT ON public.document_chunks TO authenticated;
GRANT ALL ON public.document_chunks TO service_role;

ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read chunks"
  ON public.document_chunks FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
  ON public.document_chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS document_chunks_document_idx
  ON public.document_chunks(document_id);

CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding vector(1536),
  match_count int DEFAULT 6,
  similarity_threshold float DEFAULT 0.2
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  source_title text,
  content text,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.document_id,
    c.source_title,
    c.content,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.document_chunks c
  WHERE 1 - (c.embedding <=> query_embedding) > similarity_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_document_chunks(vector, int, float) TO authenticated, service_role;
