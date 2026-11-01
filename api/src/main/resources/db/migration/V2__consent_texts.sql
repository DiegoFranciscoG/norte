-- Textos de consentimiento vigentes (LOPDP: consentimiento por finalidad, informado y con versión).
INSERT INTO consent_texts (purpose, version, text, published_at, is_current) VALUES
('PROFILE_STORAGE', '2026-10',
 'Autorizo a NORTE a guardar en mi cuenta los identificadores de mis habilidades (con su código ESCO si existe), si son demostradas o declaradas, mis años de experiencia, mi nivel de inglés y mis preferencias, con la única finalidad de calcular mi encaje con vacantes. Nunca se guarda mi CV. Puedo retirar este consentimiento y esos datos se borran.',
 DATE '2026-10-31', TRUE),
('EMAIL_ALERTS', '2026-10',
 'Autorizo a NORTE a usar mi correo y mi perfil guardado para enviarme las vacantes nuevas que superen el puntaje mínimo que yo defina. Puedo retirar este consentimiento en cualquier momento y dejaré de recibir alertas.',
 DATE '2026-10-31', TRUE);
