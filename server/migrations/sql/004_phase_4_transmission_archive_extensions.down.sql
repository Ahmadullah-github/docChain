-- 004_phase_4_transmission_archive_extensions.cjs down
-- SQL migration for MySQL.

drop table if exists `api_clients`;
drop table if exists `document_verification_tokens`;
drop table if exists `document_ocr_text`;
drop table if exists `saved_searches`;
drop table if exists `document_comments`;
drop table if exists `notification_preferences`;
drop table if exists `notifications`;
drop table if exists `delegations`;
drop table if exists `archive_records`;
drop table if exists `render_signature_visibility`;
drop table if exists `document_renders`;
drop table if exists `transmission_recipients`;
drop table if exists `transmissions`;
drop table if exists `confidentiality_access_rules`;
drop table if exists `retention_policies`;
drop table if exists `visibility_rules`;
drop table if exists `external_recipients`;
drop table if exists `external_organizations`;
