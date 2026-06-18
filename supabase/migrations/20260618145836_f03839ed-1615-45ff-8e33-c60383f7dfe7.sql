
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'coach');
CREATE TYPE public.student_level AS ENUM ('beginner', 'intermediate', 'advanced');
CREATE TYPE public.ai_generation_type AS ENUM ('curriculum', 'tryout', 'recommendation');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles readable by authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ updated_at helper ============
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ NEW USER TRIGGER (auto profile + first user = admin) ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));

  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count <= 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'coach');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'coach');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ APP SETTINGS ============
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage settings" ON public.app_settings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.app_settings (key, value) VALUES
  ('kie_ai_api_key', 'PLACEHOLDER_REPLACE_ME'),
  ('kie_ai_base_url', 'https://api.kie.ai/v1'),
  ('kie_ai_model', 'opus-4.8');

-- ============ STUDENTS ============
CREATE TABLE public.students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  age INT,
  level public.student_level NOT NULL DEFAULT 'beginner',
  assigned_coach_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  parent_name TEXT,
  parent_zalo_phone TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read students" ON public.students
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create students" ON public.students
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Coach or admin update student" ON public.students
  FOR UPDATE TO authenticated
  USING (assigned_coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (assigned_coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete students" ON public.students
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_students_updated BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ SKILL CATEGORIES ============
CREATE TABLE public.skill_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  unit TEXT,
  description TEXT,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.skill_categories TO authenticated;
GRANT ALL ON public.skill_categories TO service_role;
ALTER TABLE public.skill_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read skills" ON public.skill_categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage skills" ON public.skill_categories
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.skill_categories (name, unit, description, display_order) VALUES
  ('Ném rổ (Shooting)', 'điểm/10 lần', 'Số lần ném vào rổ trên 10 lần thử', 1),
  ('Dẫn bóng (Dribbling)', 'giây', 'Thời gian hoàn thành đường dẫn bóng chuẩn', 2),
  ('Tốc độ (Speed)', 'giây', 'Chạy nước rút full court', 3),
  ('Nhanh nhẹn (Agility)', 'giây', 'Bài kiểm tra lane agility', 4),
  ('Sức bền (Endurance)', 'điểm', 'Yo-yo / suicide drill', 5);

-- ============ TEST SCORES ============
CREATE TABLE public.test_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  skill_category_id UUID NOT NULL REFERENCES public.skill_categories(id) ON DELETE RESTRICT,
  score NUMERIC NOT NULL,
  tested_at DATE NOT NULL DEFAULT CURRENT_DATE,
  coach_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_scores TO authenticated;
GRANT ALL ON public.test_scores TO service_role;
ALTER TABLE public.test_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read scores" ON public.test_scores
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Coach insert scores" ON public.test_scores
  FOR INSERT TO authenticated WITH CHECK (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Coach update own scores" ON public.test_scores
  FOR UPDATE TO authenticated USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Coach delete own scores" ON public.test_scores
  FOR DELETE TO authenticated USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_test_scores_student ON public.test_scores(student_id, tested_at DESC);

-- ============ LIBRARY DOCUMENTS ============
CREATE TABLE public.library_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  storage_path TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_documents TO authenticated;
GRANT ALL ON public.library_documents TO service_role;
ALTER TABLE public.library_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read library" ON public.library_documents
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage library" ON public.library_documents
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Storage policies for 'library' bucket (bucket created via tool)
CREATE POLICY "Authenticated read library files" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'library');
CREATE POLICY "Admins upload library files" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'library' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete library files" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'library' AND public.has_role(auth.uid(), 'admin'));

-- ============ AI GENERATIONS LOG ============
CREATE TABLE public.ai_generations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generation_type public.ai_generation_type NOT NULL,
  target_label TEXT NOT NULL,
  prompt TEXT,
  response TEXT NOT NULL,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_generations TO authenticated;
GRANT ALL ON public.ai_generations TO service_role;
ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach read own generations" ON public.ai_generations
  FOR SELECT TO authenticated USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Coach insert own generations" ON public.ai_generations
  FOR INSERT TO authenticated WITH CHECK (coach_id = auth.uid());
CREATE POLICY "Admins delete generations" ON public.ai_generations
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_ai_generations_coach_month ON public.ai_generations(coach_id, created_at DESC);

-- ============ COACH OF THE MONTH ============
CREATE TABLE public.coach_of_the_month (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  month DATE NOT NULL UNIQUE,
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_name TEXT NOT NULL,
  usage_score NUMERIC NOT NULL DEFAULT 0,
  performance_score NUMERIC NOT NULL DEFAULT 0,
  total_score NUMERIC NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coach_of_the_month TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_of_the_month TO authenticated;
GRANT ALL ON public.coach_of_the_month TO service_role;
ALTER TABLE public.coach_of_the_month ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read coach of the month" ON public.coach_of_the_month
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins write coach of the month" ON public.coach_of_the_month
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ COACH OF THE MONTH COMPUTE FUNCTION ============
CREATE OR REPLACE FUNCTION public.compute_coach_of_the_month()
RETURNS TABLE(coach_id UUID, coach_name TEXT, usage_score NUMERIC, performance_score NUMERIC, total_score NUMERIC)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH month_start AS (SELECT date_trunc('month', now())::date AS d),
  usage AS (
    SELECT g.coach_id, COUNT(*)::numeric AS gens
    FROM public.ai_generations g, month_start m
    WHERE g.created_at >= m.d
    GROUP BY g.coach_id
  ),
  perf AS (
    -- average per-student score improvement (latest - earliest) for each coach's assigned students
    SELECT s.assigned_coach_id AS coach_id, COALESCE(AVG(delta), 0)::numeric AS avg_delta
    FROM public.students s
    LEFT JOIN LATERAL (
      SELECT (
        (SELECT score FROM public.test_scores t WHERE t.student_id = s.id ORDER BY tested_at DESC LIMIT 1)
        -
        (SELECT score FROM public.test_scores t WHERE t.student_id = s.id ORDER BY tested_at ASC LIMIT 1)
      ) AS delta
    ) d ON true
    WHERE s.assigned_coach_id IS NOT NULL
    GROUP BY s.assigned_coach_id
  ),
  combined AS (
    SELECT
      COALESCE(u.coach_id, p.coach_id) AS coach_id,
      COALESCE(u.gens, 0) AS usage_score,
      COALESCE(p.avg_delta, 0) AS performance_score,
      (COALESCE(u.gens, 0) * 1.0 + COALESCE(p.avg_delta, 0) * 2.0) AS total_score
    FROM usage u FULL OUTER JOIN perf p ON u.coach_id = p.coach_id
  )
  SELECT c.coach_id, COALESCE(pr.full_name, 'HLV') AS coach_name,
         c.usage_score, c.performance_score, c.total_score
  FROM combined c
  LEFT JOIN public.profiles pr ON pr.id = c.coach_id
  WHERE c.coach_id IS NOT NULL
  ORDER BY c.total_score DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.compute_coach_of_the_month() TO anon, authenticated;
