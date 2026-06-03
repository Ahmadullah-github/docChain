-- 003_secure_signature_verification down

drop table if exists `signature_upload_sessions`;

alter table `document_renders`
  drop index `document_renders_document_hash_index`;

alter table `document_renders`
  drop column `verification_url`,
  drop column `document_hash`;

alter table `signature_events`
  drop index `signature_events_document_hash_index`;

alter table `signature_events`
  drop column `document_hash`,
  drop column `document_version_number`;

alter table `document_versions`
  drop index `document_versions_content_hash_index`;

alter table `document_versions`
  drop column `content_hash`;
