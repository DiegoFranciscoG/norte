-- NORTE es global: la persona indica su país (ISO 3166-1 alfa-2), su ciudad si quiere y las modalidades que busca.
ALTER TABLE profiles ALTER COLUMN home_city DROP NOT NULL;
ALTER TABLE profiles ADD COLUMN home_country VARCHAR(2) CHECK (home_country ~ '^[A-Z]{2}$');
ALTER TABLE profiles ADD COLUMN modalities JSONB NOT NULL DEFAULT '[]'::jsonb;
