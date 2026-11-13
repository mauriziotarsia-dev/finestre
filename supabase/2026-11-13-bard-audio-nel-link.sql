-- 13/11 · Bard anche col link della stanza (senza account): il deposito dmaster-media accetta anche i file audio,
-- come il deposito privato «atmosfera» (2026-11-01-bard-audio.sql). Applicata da Claude il 13/11.
update storage.buckets set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime',
  'audio/mpeg','audio/mp4','audio/aac','audio/ogg','audio/webm','audio/wav','audio/x-wav','audio/flac'] where id = 'dmaster-media';
