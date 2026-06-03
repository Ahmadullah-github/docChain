-- 002_document_system down

drop table if exists `document_write_rules`;

drop table if exists `global_search_index`;

drop table if exists `document_layout_drafts`;
drop table if exists `document_template_bindings`;
alter table `document_templates` drop foreign key `document_templates_current_version_id_foreign`;
drop table if exists `document_template_versions`;
drop table if exists `document_templates`;

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
drop table if exists `external_recipients`;
drop table if exists `external_organizations`;

drop table if exists `serial_repair_events`;
alter table `serial_assignments` drop foreign key `serial_assignments_signature_event_id_foreign`;
drop table if exists `signature_events`;
drop table if exists `serial_assignments`;
drop table if exists `serial_sequences`;
drop table if exists `serial_rules`;
drop table if exists `pin_verification_events`;
drop table if exists `signature_assets`;
drop table if exists `signature_profiles`;

drop table if exists `document_tasks`;
drop table if exists `document_workflow_events`;
drop table if exists `document_attachments`;
drop table if exists `document_relations`;
drop table if exists `document_versions`;
drop table if exists `documents`;
drop table if exists `file_assets`;
