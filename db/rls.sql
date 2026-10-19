-- =====================================================================
-- ChantierPilot — Row Level Security (RLS) & durcissement
--
-- Modèle de sécurité :
--   * Toutes les tables métier ont RLS activé + FORCÉ (FORCE ROW LEVEL
--     SECURITY) : les politiques s'appliquent AUSSI au propriétaire de la
--     table. Aucune requête métier n'est possible sans contexte d'entreprise.
--   * Le contexte est posé par l'API, À L'INTÉRIEUR D'UNE TRANSACTION :
--         SELECT set_config('app.company_id', '<uuid>', true);
--         SELECT set_config('app.user_id',    '<uuid>', true);
--         SELECT set_config('app.role',       'admin',  true);
--     Le « true » = SET LOCAL : le contexte disparaît à la fin de la
--     transaction (sûr avec un pool de connexions).
--   * Sans contexte, app_current_company_id() vaut NULL → politiques
--     refusent tout (déni par défaut).
--   * Deux rôles applicatifs :
--       - chantierpilot_app      : rôle de connexion de l'API (RLS strict,
--         ne peut pas s'élever, ne peut pas créer de rôles).
--       - chantierpilot_definer  : propriétaire des fonctions d'authentifi-
--         cation (SECURITY DEFINER). Seul ce rôle contourne le RLS, et
--         UNIQUEMENT pour les fonctions d'ouverture de session, qui ne
--         touchent qu'à app_users / sessions.
--   * Les tables métier (companies, projects, expenses, payments,
--     audit_log) n'ont AUCUNE porte de sortie : personne d'autre que le
--     contexte entreprise courant ne les lit/écrit.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Rôles applicatifs (idempotent)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_me name := current_user;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'chantierpilot_definer') THEN
    EXECUTE 'CREATE ROLE chantierpilot_definer NOLOGIN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'chantierpilot_app') THEN
    EXECUTE 'CREATE ROLE chantierpilot_app NOLOGIN';
  END IF;
  -- Le rôle d'administration doit pouvoir transférer la propriété des fonctions.
  EXECUTE format('GRANT chantierpilot_definer TO %I', v_me);
END;
$$;

-- ---------------------------------------------------------------------
-- 2. Fonctions de lecture du contexte (STABLE, sans droits particuliers)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_current_company_id() RETURNS UUID
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$ SELECT nullif(current_setting('app.company_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS UUID
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_current_role() RETURNS TEXT
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$ SELECT coalesce(nullif(current_setting('app.role', true), ''), '') $$;

-- Vrai uniquement si la requête s'exécute en tant que chantierpilot_definer
-- (cad à l'intérieur des fonctions d'authentification ci-dessous).
CREATE OR REPLACE FUNCTION app_is_definer() RETURNS BOOLEAN
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$ SELECT current_user = 'chantierpilot_definer'::name $$;

-- ---------------------------------------------------------------------
-- 3. Fonctions d'authentification (SECURITY DEFINER)
--    Elles tournent en tant que chantierpilot_definer et ne manipulent que
--    app_users / sessions (jamais les tables métier).
-- ---------------------------------------------------------------------

-- Recherche d'un compte par email (connexion). Retourne NULL si inconnu.
CREATE OR REPLACE FUNCTION api_lookup_user(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v JSONB;
BEGIN
  SELECT jsonb_build_object(
    'user_id', u.id,
    'company_id', u.company_id,
    'password_hash', u.password_hash,
    'full_name', u.full_name,
    'role', u.role,
    'auth_provider', u.auth_provider,
    'auth_subject', u.auth_subject,
    'is_active', u.is_active,
    'failed_login_attempts', u.failed_login_attempts,
    'locked_until', u.locked_until
  )
  INTO v
  FROM app_users u
  WHERE u.email = lower(btrim(p_email));
  RETURN v;
END;
$$;

-- Validation d'un jeton de session (hash SHA-256). NULL si invalide/expiré.
CREATE OR REPLACE FUNCTION api_lookup_session(p_token_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v JSONB;
BEGIN
  SELECT jsonb_build_object(
    'session_id', s.id,
    'user_id', u.id,
    'company_id', u.company_id,
    'role', u.role,
    'full_name', u.full_name,
    'email', u.email,
    'expires_at', s.expires_at
  )
  INTO v
  FROM sessions s
  JOIN app_users u ON u.id = s.user_id
  WHERE s.token_hash = p_token_hash
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
    AND u.is_active = TRUE;
  RETURN v;
END;
$$;

-- Échec de connexion : compteur + verrouillage progressif.
CREATE OR REPLACE FUNCTION api_fail_login(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_attempts INTEGER;
  v_locked TIMESTAMPTZ;
BEGIN
  UPDATE app_users
  SET failed_login_attempts = failed_login_attempts + 1,
      locked_until = CASE
        WHEN failed_login_attempts + 1 >= 10 THEN now() + interval '15 minutes'
        WHEN failed_login_attempts + 1 >= 5  THEN now() + interval '3 minutes'
        ELSE locked_until
      END
  WHERE email = lower(btrim(p_email))
  RETURNING failed_login_attempts, locked_until INTO v_attempts, v_locked;

  RETURN jsonb_build_object('failed_login_attempts', coalesce(v_attempts, 0), 'locked_until', v_locked);
END;
$$;

-- Connexion réussie : remise à zéro du compteur.
CREATE OR REPLACE FUNCTION api_succeed_login(p_email TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE app_users
  SET failed_login_attempts = 0,
      locked_until = NULL
  WHERE email = lower(btrim(p_email));
END;
$$;


-- Révocation des sessions d'un compte par l'administrateur de SON entreprise.
-- Exige le contexte (rôle admin + même entreprise) posé par withTenant :
-- un admin ne peut révoquer que les sessions d'un membre de son entreprise.
CREATE OR REPLACE FUNCTION api_admin_revoke_sessions(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  n INTEGER;
BEGIN
  IF app_current_role() <> 'admin' THEN
    RAISE EXCEPTION 'droits insuffisants' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM app_users
    WHERE id = p_user_id AND company_id = app_current_company_id()
  ) THEN
    RETURN 0;
  END IF;
  UPDATE sessions SET revoked_at = now()
  WHERE user_id = p_user_id AND revoked_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Hygiène : purge des sessions expirées depuis plus de 30 jours.
CREATE OR REPLACE FUNCTION api_cleanup_sessions()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  n INTEGER;
BEGIN
  DELETE FROM sessions WHERE expires_at < now() - interval '30 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Propriétaire des fonctions = rôle défineur (porte d'accès minimale).
-- PostgreSQL ≥ 15 exige que le NOUVEAU propriétaire ait CREATE sur le schéma.
-- Un superuser contourne ce contrôle, pas le propriétaire Neon (neondb_owner) :
-- le droit est accordé le temps du transfert puis retiré aussitôt.
GRANT CREATE ON SCHEMA public TO chantierpilot_definer;
ALTER FUNCTION api_lookup_user(TEXT)          OWNER TO chantierpilot_definer;
ALTER FUNCTION api_lookup_session(TEXT)       OWNER TO chantierpilot_definer;
ALTER FUNCTION api_fail_login(TEXT)           OWNER TO chantierpilot_definer;
ALTER FUNCTION api_succeed_login(TEXT)        OWNER TO chantierpilot_definer;
ALTER FUNCTION api_cleanup_sessions()         OWNER TO chantierpilot_definer;
ALTER FUNCTION api_admin_revoke_sessions(UUID) OWNER TO chantierpilot_definer;
REVOKE CREATE ON SCHEMA public FROM chantierpilot_definer;

REVOKE ALL ON FUNCTION api_lookup_user(TEXT)    FROM PUBLIC;
REVOKE ALL ON FUNCTION api_lookup_session(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION api_fail_login(TEXT)     FROM PUBLIC;
REVOKE ALL ON FUNCTION api_succeed_login(TEXT)  FROM PUBLIC;
REVOKE ALL ON FUNCTION api_cleanup_sessions()   FROM PUBLIC;
REVOKE ALL ON FUNCTION api_admin_revoke_sessions(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION api_lookup_user(TEXT)    TO chantierpilot_app;
GRANT EXECUTE ON FUNCTION api_lookup_session(TEXT) TO chantierpilot_app;
GRANT EXECUTE ON FUNCTION api_fail_login(TEXT)     TO chantierpilot_app;
GRANT EXECUTE ON FUNCTION api_succeed_login(TEXT)  TO chantierpilot_app;
GRANT EXECUTE ON FUNCTION api_cleanup_sessions()   TO chantierpilot_app;
GRANT EXECUTE ON FUNCTION api_admin_revoke_sessions(UUID) TO chantierpilot_app;

-- Les fonctions de contexte sont appelées PAR LES POLITIQUES : le rôle
-- applicatif doit pouvoir les exécuter (elles ne lisent que des GUC).
GRANT EXECUTE ON FUNCTION app_current_company_id() TO chantierpilot_app, chantierpilot_definer;
GRANT EXECUTE ON FUNCTION app_current_user_id()    TO chantierpilot_app, chantierpilot_definer;
GRANT EXECUTE ON FUNCTION app_current_role()       TO chantierpilot_app, chantierpilot_definer;
GRANT EXECUTE ON FUNCTION app_is_definer()         TO chantierpilot_app, chantierpilot_definer;
GRANT EXECUTE ON FUNCTION set_updated_at()         TO chantierpilot_app, chantierpilot_definer;

-- ---------------------------------------------------------------------
-- 4. Activation + FORCAGE du RLS sur toutes les tables
-- ---------------------------------------------------------------------
ALTER TABLE companies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects   ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log  ENABLE ROW LEVEL SECURITY;

ALTER TABLE companies  FORCE ROW LEVEL SECURITY;
ALTER TABLE app_users  FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions   FORCE ROW LEVEL SECURITY;
ALTER TABLE projects   FORCE ROW LEVEL SECURITY;
ALTER TABLE expenses   FORCE ROW LEVEL SECURITY;
ALTER TABLE payments   FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_log  FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 5. Politiques d'isolation par entreprise
-- ---------------------------------------------------------------------

-- companies ----------------------------------------------------------
DROP POLICY IF EXISTS companies_select ON companies;
DROP POLICY IF EXISTS companies_insert ON companies;
DROP POLICY IF EXISTS companies_update ON companies;
CREATE POLICY companies_select ON companies
  FOR SELECT USING (id = app_current_company_id());
CREATE POLICY companies_insert ON companies
  FOR INSERT WITH CHECK (id = app_current_company_id());
CREATE POLICY companies_update ON companies
  FOR UPDATE USING (id = app_current_company_id())
  WITH CHECK (id = app_current_company_id());
-- Pas de politique DELETE : une entreprise ne se supprime pas depuis l'app.

-- app_users (le contexte compte courant suffit ; le défenieur n'y accède
-- que via les fonctions d'authentification) ---------------------------
DROP POLICY IF EXISTS app_users_select ON app_users;
DROP POLICY IF EXISTS app_users_insert ON app_users;
DROP POLICY IF EXISTS app_users_update ON app_users;
CREATE POLICY app_users_select ON app_users
  FOR SELECT USING (company_id = app_current_company_id() OR app_is_definer());
CREATE POLICY app_users_insert ON app_users
  FOR INSERT WITH CHECK (company_id = app_current_company_id());
CREATE POLICY app_users_update ON app_users
  FOR UPDATE USING (company_id = app_current_company_id() OR app_is_definer())
  WITH CHECK (company_id = app_current_company_id() OR app_is_definer());
-- Pas de DELETE : comptes conservés (traçabilité), désactivation possible.

-- sessions -----------------------------------------------------------
DROP POLICY IF EXISTS sessions_select ON sessions;
DROP POLICY IF EXISTS sessions_insert ON sessions;
DROP POLICY IF EXISTS sessions_update ON sessions;
DROP POLICY IF EXISTS sessions_delete ON sessions;
CREATE POLICY sessions_select ON sessions
  FOR SELECT USING (user_id = app_current_user_id() OR app_is_definer());
CREATE POLICY sessions_insert ON sessions
  FOR INSERT WITH CHECK (user_id = app_current_user_id());
CREATE POLICY sessions_update ON sessions
  FOR UPDATE USING (user_id = app_current_user_id() OR app_is_definer())
  WITH CHECK (user_id = app_current_user_id() OR app_is_definer());
CREATE POLICY sessions_delete ON sessions
  FOR DELETE USING (user_id = app_current_user_id() OR app_is_definer());

-- projects -----------------------------------------------------------
DROP POLICY IF EXISTS projects_select ON projects;
DROP POLICY IF EXISTS projects_insert ON projects;
DROP POLICY IF EXISTS projects_update ON projects;
DROP POLICY IF EXISTS projects_delete ON projects;
CREATE POLICY projects_select ON projects
  FOR SELECT USING (company_id = app_current_company_id());
CREATE POLICY projects_insert ON projects
  FOR INSERT WITH CHECK (company_id = app_current_company_id());
CREATE POLICY projects_update ON projects
  FOR UPDATE USING (company_id = app_current_company_id())
  WITH CHECK (company_id = app_current_company_id());
CREATE POLICY projects_delete ON projects
  FOR DELETE USING (company_id = app_current_company_id());

-- expenses -----------------------------------------------------------
-- La dépense doit appartenir à l'entreprise ET viser un chantier de
-- cette même entreprise (aucun lien croisé possible).
DROP POLICY IF EXISTS expenses_select ON expenses;
DROP POLICY IF EXISTS expenses_insert ON expenses;
DROP POLICY IF EXISTS expenses_update ON expenses;
DROP POLICY IF EXISTS expenses_delete ON expenses;
CREATE POLICY expenses_select ON expenses
  FOR SELECT USING (company_id = app_current_company_id());
CREATE POLICY expenses_insert ON expenses
  FOR INSERT WITH CHECK (
    company_id = app_current_company_id()
    AND (SELECT p.company_id FROM projects p WHERE p.id = project_id) = app_current_company_id()
  );
CREATE POLICY expenses_update ON expenses
  FOR UPDATE USING (company_id = app_current_company_id())
  WITH CHECK (
    company_id = app_current_company_id()
    AND (SELECT p.company_id FROM projects p WHERE p.id = project_id) = app_current_company_id()
  );
CREATE POLICY expenses_delete ON expenses
  FOR DELETE USING (company_id = app_current_company_id());

-- payments -----------------------------------------------------------
DROP POLICY IF EXISTS payments_select ON payments;
DROP POLICY IF EXISTS payments_insert ON payments;
DROP POLICY IF EXISTS payments_update ON payments;
DROP POLICY IF EXISTS payments_delete ON payments;
CREATE POLICY payments_select ON payments
  FOR SELECT USING (company_id = app_current_company_id());
CREATE POLICY payments_insert ON payments
  FOR INSERT WITH CHECK (
    company_id = app_current_company_id()
    AND (SELECT p.company_id FROM projects p WHERE p.id = project_id) = app_current_company_id()
  );
CREATE POLICY payments_update ON payments
  FOR UPDATE USING (company_id = app_current_company_id())
  WITH CHECK (
    company_id = app_current_company_id()
    AND (SELECT p.company_id FROM projects p WHERE p.id = project_id) = app_current_company_id()
  );
CREATE POLICY payments_delete ON payments
  FOR DELETE USING (company_id = app_current_company_id());

-- audit_log : lecture + écriture dans l'entreprise, aucune modification
-- ni suppression (journal inaltérable côté application).
DROP POLICY IF EXISTS audit_select ON audit_log;
DROP POLICY IF EXISTS audit_insert ON audit_log;
CREATE POLICY audit_select ON audit_log
  FOR SELECT USING (company_id = app_current_company_id());
CREATE POLICY audit_insert ON audit_log
  FOR INSERT WITH CHECK (company_id = app_current_company_id());

-- ---------------------------------------------------------------------
-- 6. Privilèges : on repart de zéro, puis le minimum vital
-- ---------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO chantierpilot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  companies, app_users, sessions, projects, expenses, payments, audit_log
  TO chantierpilot_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO chantierpilot_app;

GRANT USAGE ON SCHEMA public TO chantierpilot_definer;
GRANT SELECT, UPDATE, INSERT, DELETE ON app_users, sessions TO chantierpilot_definer;

COMMIT;
