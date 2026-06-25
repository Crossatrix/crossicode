CREATE TABLE public.github_installations (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  installation_id bigint NOT NULL,
  account_login text NOT NULL,
  installed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.github_installations TO authenticated;
GRANT ALL ON public.github_installations TO service_role;

ALTER TABLE public.github_installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own installation" ON public.github_installations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own installation" ON public.github_installations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own installation" ON public.github_installations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own installation" ON public.github_installations
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER github_installations_updated_at
  BEFORE UPDATE ON public.github_installations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();