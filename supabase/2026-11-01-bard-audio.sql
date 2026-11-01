-- Bard (1/11/2026): la libreria della stanza tiene anche suoni e musiche (cartella <libreria>/bard/)
update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4','video/webm',
  'audio/mpeg','audio/mp4','audio/aac','audio/ogg','audio/webm','audio/wav','audio/x-wav','audio/flac']
where id = 'atmosfera';
