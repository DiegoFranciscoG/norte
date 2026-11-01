-- NORTE · esquema privado. Toda tabla con datos de una persona cuelga de users con ON DELETE CASCADE:
-- borrar la cuenta borra todo, sin filas huérfanas (prueba T-09).
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
    id             UUID PRIMARY KEY,
    email          CITEXT       NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_login_at  TIMESTAMPTZ,
    CONSTRAINT users_email_len CHECK (char_length(email) BETWEEN 3 AND 254)
);

CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  VARCHAR(64) NOT NULL UNIQUE,
    family_id   UUID        NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

-- Textos versionados de cada finalidad: el consentimiento guarda qué versión aceptó la persona.
CREATE TABLE consent_texts (
    purpose       VARCHAR(40)   NOT NULL,
    version       VARCHAR(20)   NOT NULL,
    text          VARCHAR(2000) NOT NULL,
    published_at  DATE          NOT NULL,
    is_current    BOOLEAN       NOT NULL DEFAULT FALSE,
    PRIMARY KEY (purpose, version)
);

-- Registro de decisiones (solo inserciones): la vigente es la más reciente por finalidad.
CREATE TABLE consents (
    id            UUID PRIMARY KEY,
    user_id       UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    purpose       VARCHAR(40) NOT NULL,
    text_version  VARCHAR(20) NOT NULL,
    granted       BOOLEAN     NOT NULL,
    decided_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT consents_purpose_chk CHECK (purpose IN ('PROFILE_STORAGE', 'EMAIL_ALERTS'))
);
CREATE INDEX consents_user_purpose_idx ON consents (user_id, purpose, decided_at DESC);

CREATE TABLE profiles (
    user_id              UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    home_city            VARCHAR(80)  NOT NULL,
    accepts_relocation   BOOLEAN      NOT NULL DEFAULT FALSE,
    years_of_experience  NUMERIC(4,1) CHECK (years_of_experience BETWEEN 0 AND 50),
    english_level        VARCHAR(2)   CHECK (english_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
    min_salary_usd       INTEGER      CHECK (min_salary_usd >= 0),
    weights              JSONB,
    github_user          VARCHAR(39),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Solo identificadores de habilidades (y su URI ESCO), nunca el CV.
CREATE TABLE profile_skills (
    id        UUID PRIMARY KEY,
    user_id   UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    skill_id  VARCHAR(60) NOT NULL,
    esco_uri  VARCHAR(200),
    origin    VARCHAR(15) NOT NULL CHECK (origin IN ('DEMONSTRATED', 'DECLARED')),
    repos     JSONB       NOT NULL DEFAULT '[]'::jsonb,
    UNIQUE (user_id, skill_id)
);

CREATE TABLE analyzed_repos (
    id           UUID PRIMARY KEY,
    user_id      UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name         VARCHAR(100) NOT NULL,
    url          VARCHAR(300) NOT NULL,
    pushed_at    TIMESTAMPTZ,
    skills       JSONB        NOT NULL DEFAULT '[]'::jsonb,
    analyzed_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX analyzed_repos_user_idx ON analyzed_repos (user_id);

CREATE TABLE applications (
    id            UUID PRIMARY KEY,
    user_id       UUID          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    job_id        VARCHAR(40)   NOT NULL,
    job_title     VARCHAR(300)  NOT NULL,
    company       VARCHAR(200)  NOT NULL,
    job_url       VARCHAR(1000),
    status        VARCHAR(15)   NOT NULL CHECK (status IN ('SAVED', 'APPLIED', 'REPLIED', 'INTERVIEW', 'OFFER', 'REJECTED')),
    applied_at    DATE,
    follow_up_at  DATE,
    notes         VARCHAR(4000),
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (user_id, job_id)
);

CREATE TABLE application_events (
    id              UUID PRIMARY KEY,
    application_id  UUID        NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
    status          VARCHAR(15) NOT NULL,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX application_events_app_idx ON application_events (application_id);

CREATE TABLE alerts (
    user_id             UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    enabled             BOOLEAN     NOT NULL DEFAULT FALSE,
    min_score           INTEGER     NOT NULL DEFAULT 70 CHECK (min_score BETWEEN 0 AND 100),
    last_index_version  VARCHAR(40),
    last_run_at         TIMESTAMPTZ,
    last_sent_at        TIMESTAMPTZ
);

-- Auditoría sin datos personales en el detalle. Al borrar la cuenta sus filas desaparecen;
-- el evento de borrado se registra sin user_id.
CREATE TABLE audit_log (
    id       BIGSERIAL PRIMARY KEY,
    user_id  UUID        REFERENCES users (id) ON DELETE CASCADE,
    action   VARCHAR(40) NOT NULL,
    at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    detail   VARCHAR(300)
);
CREATE INDEX audit_log_user_idx ON audit_log (user_id);
