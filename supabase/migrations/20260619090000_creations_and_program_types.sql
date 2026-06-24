-- "My Creations" folder: every produced program (curriculum / strength / hybrid
-- / tryout) is saved here, owned by the coach who made it.
CREATE TABLE IF NOT EXISTS public.creations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,                       -- curriculum | strength | hybrid | tryout
  title text NOT NULL,
  content text NOT NULL,                    -- markdown
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.creations TO authenticated;
ALTER TABLE public.creations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own creations select" ON public.creations;
CREATE POLICY "own creations select" ON public.creations
  FOR SELECT TO authenticated
  USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "own creations insert" ON public.creations;
CREATE POLICY "own creations insert" ON public.creations
  FOR INSERT TO authenticated WITH CHECK (coach_id = auth.uid());

DROP POLICY IF EXISTS "own creations update" ON public.creations;
CREATE POLICY "own creations update" ON public.creations
  FOR UPDATE TO authenticated USING (coach_id = auth.uid());

DROP POLICY IF EXISTS "own creations delete" ON public.creations;
CREATE POLICY "own creations delete" ON public.creations
  FOR DELETE TO authenticated USING (coach_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_creations_coach ON public.creations(coach_id, created_at DESC);

-- New program kinds for the generation-type enum (used by ai_generations logging).
ALTER TYPE public.ai_generation_type ADD VALUE IF NOT EXISTS 'strength';
ALTER TYPE public.ai_generation_type ADD VALUE IF NOT EXISTS 'hybrid';
