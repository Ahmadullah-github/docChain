-- 003_secure_signature_verification up
-- Secure approval hashes, final render verification, and phone signature setup sessions.

alter table `document_versions`
  add column `content_hash` varchar(64) null after `version_number`;

alter table `document_versions`
  add index `document_versions_content_hash_index`(`content_hash`);

alter table `signature_events`
  add column `document_version_number` int unsigned null after `pin_verification_event_id`,
  add column `document_hash` varchar(64) null after `document_version_number`;

alter table `signature_events`
  add index `signature_events_document_hash_index`(`document_hash`);

alter table `document_renders`
  add column `document_hash` varchar(64) null after `source_version_number`,
  add column `verification_url` varchar(500) null after `document_hash`;

alter table `document_renders`
  add index `document_renders_document_hash_index`(`document_hash`);

create table `signature_upload_sessions` (
  `id` bigint unsigned not null auto_increment primary key,
  `uuid` char(36) not null,
  `user_id` bigint unsigned not null,
  `assignment_id` bigint unsigned,
  `token_hash` varchar(64) not null,
  `status` varchar(40) not null default 'pending',
  `uploaded_file_asset_id` bigint unsigned,
  `preview_data_url` mediumtext,
  `expires_at` timestamp not null,
  `consumed_at` timestamp null,
  `ip_address` varchar(80),
  `user_agent` text,
  `metadata` json,
  `created_at` timestamp not null default CURRENT_TIMESTAMP,
  `updated_at` timestamp not null default CURRENT_TIMESTAMP
);

alter table `signature_upload_sessions` add unique `signature_upload_sessions_uuid_unique`(`uuid`);
alter table `signature_upload_sessions` add unique `signature_upload_sessions_token_hash_unique`(`token_hash`);
alter table `signature_upload_sessions` add constraint `signature_upload_sessions_user_id_foreign` foreign key (`user_id`) references `users` (`id`) on delete CASCADE;
alter table `signature_upload_sessions` add constraint `signature_upload_sessions_assignment_id_foreign` foreign key (`assignment_id`) references `assignments` (`id`) on delete SET NULL;
alter table `signature_upload_sessions` add constraint `signature_upload_sessions_uploaded_file_asset_id_foreign` foreign key (`uploaded_file_asset_id`) references `file_assets` (`id`) on delete SET NULL;
alter table `signature_upload_sessions` add index `signature_upload_sessions_user_status_index`(`user_id`, `status`);
alter table `signature_upload_sessions` add index `signature_upload_sessions_expires_at_index`(`expires_at`);
