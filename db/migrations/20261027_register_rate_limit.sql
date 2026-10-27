-- Limitation d'inscription persistante et glissante.
-- Migration séparée : ne modifie aucune table métier ni donnée d'entreprise.
-- À examiner et tester sur une base isolée avant toute cible réelle.
-- Les empreintes sont pseudonymisées, pas anonymisées ; leur durée utile est
-- d'une heure et le nettoyage est appelé séparément après les contrôles.

BEGIN;

-- Ne jamais prendre silencieusement possession d'une table préexistante.
DO $$
BEGIN
  IF pg_catalog.to_regclass('public.rate_limit_counters') IS NOT NULL
     AND pg_catalog.obj_description(pg_catalog.to_regclass('public.rate_limit_counters'), 'pg_class')
         IS DISTINCT FROM 'chantierpilot:register-rate-limit:v1' THEN
    RAISE EXCEPTION 'Table de limitation préexistante à examiner avant migration.';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  scope TEXT NOT NULL,
  subject_hash TEXT NOT NULL CHECK (subject_hash ~ '^[0-9a-f]{64}$'),
  hits TIMESTAMPTZ[] NOT NULL DEFAULT ARRAY[]::TIMESTAMPTZ[],
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (scope, subject_hash)
);
COMMENT ON TABLE public.rate_limit_counters IS 'chantierpilot:register-rate-limit:v1';
CREATE INDEX IF NOT EXISTS rate_limit_counters_expires_idx ON public.rate_limit_counters (expires_at);

ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_counters FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limit_counters FROM PUBLIC, chantierpilot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rate_limit_counters TO chantierpilot_definer;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'rate_limit_counters'
      AND policyname = 'rate_limit_definer'
  ) THEN
    CREATE POLICY rate_limit_definer ON public.rate_limit_counters
      FOR ALL TO chantierpilot_definer USING (true) WITH CHECK (true);
  END IF;
END;
$$;

-- Un nom déjà occupé par une autre fonction doit être revu, pas remplacé.
DO $$
DECLARE f REGPROCEDURE;
BEGIN
  f := pg_catalog.to_regprocedure('public.api_rate_limit_hit(text)');
  IF f IS NOT NULL AND pg_catalog.obj_description(f, 'pg_proc')
       IS DISTINCT FROM 'chantierpilot:register-rate-limit-hit:v1' THEN
    RAISE EXCEPTION 'Fonction de limitation préexistante à examiner avant migration.';
  END IF;
  f := pg_catalog.to_regprocedure('public.api_rate_limit_cleanup()');
  IF f IS NOT NULL AND pg_catalog.obj_description(f, 'pg_proc')
       IS DISTINCT FROM 'chantierpilot:register-rate-limit-cleanup:v1' THEN
    RAISE EXCEPTION 'Fonction de nettoyage préexistante à examiner avant migration.';
  END IF;
END;
$$;

-- Le quota est fixé ici et non fourni par l'appelant : dix tentatives sur
-- les soixante dernières minutes, même depuis plusieurs processus API.
CREATE OR REPLACE FUNCTION public.api_rate_limit_hit(p_subject_hash TEXT)
RETURNS TABLE (allowed BOOLEAN, retry_after INTEGER)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_hits TIMESTAMPTZ[];
  v_now TIMESTAMPTZ;
  v_retry INTEGER;
BEGIN
  IF p_subject_hash IS NULL OR p_subject_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Empreinte de limitation invalide.' USING ERRCODE = '22023';
  END IF;

  -- Une suppression simultanée d'un ancien compteur peut suivre le conflit
  -- d'insertion : réessayer jusqu'à verrouiller la ligne courante.
  LOOP
    INSERT INTO public.rate_limit_counters (scope, subject_hash, hits, expires_at)
    VALUES ('register', p_subject_hash, ARRAY[]::TIMESTAMPTZ[], clock_timestamp() + interval '1 hour')
    ON CONFLICT (scope, subject_hash) DO NOTHING;

    SELECT c.hits INTO v_hits FROM public.rate_limit_counters c
      WHERE c.scope = 'register' AND c.subject_hash = p_subject_hash
      FOR UPDATE;
    EXIT WHEN FOUND;
  END LOOP;

  -- Horodater après le verrou : les appels concurrents restent ordonnés.
  v_now := clock_timestamp();
  SELECT COALESCE(array_agg(hit ORDER BY hit), ARRAY[]::TIMESTAMPTZ[]) INTO v_hits
    FROM unnest(v_hits) AS item(hit)
    WHERE hit > v_now - interval '1 hour';

  IF cardinality(v_hits) >= 10 THEN
    UPDATE public.rate_limit_counters c
      SET hits = v_hits, expires_at = v_hits[cardinality(v_hits)] + interval '1 hour'
      WHERE c.scope = 'register' AND c.subject_hash = p_subject_hash;
    v_retry := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_hits[1] + interval '1 hour' - v_now)))::INTEGER);
    RETURN QUERY SELECT false, v_retry;
    RETURN;
  END IF;

  v_hits := array_append(v_hits, v_now);
  UPDATE public.rate_limit_counters c
    SET hits = v_hits, expires_at = v_now + interval '1 hour'
    WHERE c.scope = 'register' AND c.subject_hash = p_subject_hash;
  RETURN QUERY SELECT true, 0;
END;
$$;
COMMENT ON FUNCTION public.api_rate_limit_hit(TEXT) IS 'chantierpilot:register-rate-limit-hit:v1';

-- Appel séparé pour éviter de prendre plusieurs verrous dans la transaction
-- qui tranche un quota. Nettoyage borné et non bloquant des compteurs expirés.
CREATE OR REPLACE FUNCTION public.api_rate_limit_cleanup()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_count INTEGER;
BEGIN
  DELETE FROM public.rate_limit_counters c
  WHERE c.ctid IN (
    SELECT old.ctid FROM public.rate_limit_counters old
    WHERE old.expires_at < clock_timestamp()
    ORDER BY old.expires_at
    LIMIT 25 FOR UPDATE SKIP LOCKED
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
COMMENT ON FUNCTION public.api_rate_limit_cleanup() IS 'chantierpilot:register-rate-limit-cleanup:v1';

-- Transfert de propriété conforme au modèle SECURITY DEFINER, sans modifier
-- durablement un éventuel privilège CREATE déjà accordé au rôle propriétaire.
DO $$
DECLARE v_had_create BOOLEAN;
BEGIN
  v_had_create := pg_catalog.has_schema_privilege('chantierpilot_definer', 'public', 'CREATE');
  IF NOT v_had_create THEN
    GRANT CREATE ON SCHEMA public TO chantierpilot_definer;
  END IF;
  ALTER FUNCTION public.api_rate_limit_hit(TEXT) OWNER TO chantierpilot_definer;
  ALTER FUNCTION public.api_rate_limit_cleanup() OWNER TO chantierpilot_definer;
  IF NOT v_had_create THEN
    REVOKE CREATE ON SCHEMA public FROM chantierpilot_definer;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.api_rate_limit_hit(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.api_rate_limit_cleanup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_rate_limit_hit(TEXT) TO chantierpilot_app;
GRANT EXECUTE ON FUNCTION public.api_rate_limit_cleanup() TO chantierpilot_app;

COMMIT;
