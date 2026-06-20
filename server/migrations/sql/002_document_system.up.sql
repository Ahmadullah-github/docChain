-- 002_document_system up
-- Production baseline for document, workflow, signature, serial, transmission, template, search, and document-authoring schema.

-- Documents and workflow.
create table `file_assets` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `uploaded_by_user_id` bigint unsigned, `uploaded_by_assignment_id` bigint unsigned, `purpose` varchar(80) not null, `storage_disk` varchar(80) not null default 'local', `storage_path` varchar(500) not null, `original_filename` varchar(255) not null, `stored_filename` varchar(255), `mime_type` varchar(160) not null, `byte_size` bigint unsigned not null, `checksum_sha256` varchar(64), `encryption_status` varchar(40) not null default 'not_encrypted', `status` varchar(40) not null default 'active', `metadata` json, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP, `deleted_at` timestamp null);
alter table `file_assets` add unique `file_assets_uuid_unique`(`uuid`);
alter table `file_assets` add constraint `file_assets_uploaded_by_user_id_foreign` foreign key (`uploaded_by_user_id`) references `users` (`id`) on delete SET NULL;
alter table `file_assets` add constraint `file_assets_uploaded_by_assignment_id_foreign` foreign key (`uploaded_by_assignment_id`) references `assignments` (`id`) on delete SET NULL;
alter table `file_assets` add index `file_assets_purpose_status_index`(`purpose`, `status`);
alter table `file_assets` add index `file_assets_checksum_sha256_index`(`checksum_sha256`);
create table `documents` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `internal_reference` varchar(80) not null, `document_date` date null, `document_type_id` bigint unsigned not null, `subject` varchar(255) not null, `summary` text, `body` MEDIUMTEXT, `template_fields` json, `document_content` json null, `origin_unit_id` bigint unsigned not null, `owner_unit_id` bigint unsigned not null, `current_holder_unit_id` bigint unsigned not null, `creator_assignment_id` bigint unsigned not null, `confidentiality_level_id` bigint unsigned not null, `priority_level_id` bigint unsigned not null, `status` varchar(60) not null default 'draft', `current_version_number` int unsigned not null default '1', `official_serial` varchar(120), `finalized_at` timestamp null, `finalized_by_assignment_id` bigint unsigned, `official_serial_generated_at` timestamp null, `official_serial_generated_by_assignment_id` bigint unsigned, `closed_at` timestamp null, `archived_at` timestamp null, `archived_by_assignment_id` bigint unsigned, `archive_reason` text, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP, `deleted_at` timestamp null);
alter table `documents` add unique `documents_uuid_unique`(`uuid`);
alter table `documents` add unique `documents_internal_reference_unique`(`internal_reference`);
alter table `documents` add unique `documents_official_serial_unique`(`official_serial`);
alter table `documents` add constraint `documents_document_type_id_foreign` foreign key (`document_type_id`) references `document_types` (`id`) on delete RESTRICT;
alter table `documents` add constraint `documents_origin_unit_id_foreign` foreign key (`origin_unit_id`) references `units` (`id`) on delete RESTRICT;
alter table `documents` add constraint `documents_owner_unit_id_foreign` foreign key (`owner_unit_id`) references `units` (`id`) on delete RESTRICT;
alter table `documents` add constraint `documents_current_holder_unit_id_foreign` foreign key (`current_holder_unit_id`) references `units` (`id`) on delete RESTRICT;
alter table `documents` add constraint `documents_creator_assignment_id_foreign` foreign key (`creator_assignment_id`) references `assignments` (`id`) on delete RESTRICT;
alter table `documents` add constraint `documents_confidentiality_level_id_foreign` foreign key (`confidentiality_level_id`) references `confidentiality_levels` (`id`) on delete RESTRICT;
alter table `documents` add constraint `documents_priority_level_id_foreign` foreign key (`priority_level_id`) references `priority_levels` (`id`) on delete RESTRICT;
alter table `documents` add constraint `documents_finalized_by_assignment_id_foreign` foreign key (`finalized_by_assignment_id`) references `assignments` (`id`) on delete SET NULL;
alter table `documents` add constraint `documents_official_serial_generated_by_assignment_id_foreign` foreign key (`official_serial_generated_by_assignment_id`) references `assignments` (`id`) on delete SET NULL;
alter table `documents` add constraint `documents_archived_by_assignment_id_foreign` foreign key (`archived_by_assignment_id`) references `assignments` (`id`) on delete SET NULL;
alter table `documents` add index `documents_status_created_at_index`(`status`, `created_at`);
alter table `documents` add index `documents_document_type_id_status_index`(`document_type_id`, `status`);
alter table `documents` add index `documents_origin_unit_id_status_index`(`origin_unit_id`, `status`);
alter table `documents` add index `documents_current_holder_unit_id_status_index`(`current_holder_unit_id`, `status`);
alter table `documents` add index `documents_creator_assignment_id_index`(`creator_assignment_id`);
create table `document_versions` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `document_id` bigint unsigned not null, `version_number` int unsigned not null, `content_hash` varchar(64) null, `changed_by_assignment_id` bigint unsigned not null, `subject` varchar(255) not null, `summary` text, `body` MEDIUMTEXT, `template_fields` json, `document_content` json null, `material_change` boolean not null default '1', `change_reason` text, `snapshot` json, `created_at` timestamp not null default CURRENT_TIMESTAMP);
alter table `document_versions` add unique `document_versions_uuid_unique`(`uuid`);
alter table `document_versions` add unique `document_versions_document_id_version_number_unique`(`document_id`, `version_number`);
alter table `document_versions` add constraint `document_versions_document_id_foreign` foreign key (`document_id`) references `documents` (`id`) on delete CASCADE;
alter table `document_versions` add constraint `document_versions_changed_by_assignment_id_foreign` foreign key (`changed_by_assignment_id`) references `assignments` (`id`) on delete RESTRICT;
alter table `document_versions` add index `document_versions_changed_by_assignment_id_created_at_index`(`changed_by_assignment_id`, `created_at`);
alter table `document_versions` add index `document_versions_content_hash_index`(`content_hash`);
create table `document_relations` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `source_document_id` bigint unsigned not null, `related_document_id` bigint unsigned not null, `relation_type` varchar(60) not null, `created_by_assignment_id` bigint unsigned, `note` text, `created_at` timestamp not null default CURRENT_TIMESTAMP);
alter table `document_relations` add unique `document_relations_uuid_unique`(`uuid`);
alter table `document_relations` add unique `doc_rel_src_related_type_uq`(`source_document_id`, `related_document_id`, `relation_type`);
alter table `document_relations` add constraint `document_relations_source_document_id_foreign` foreign key (`source_document_id`) references `documents` (`id`) on delete CASCADE;
alter table `document_relations` add constraint `document_relations_related_document_id_foreign` foreign key (`related_document_id`) references `documents` (`id`) on delete CASCADE;
alter table `document_relations` add constraint `document_relations_created_by_assignment_id_foreign` foreign key (`created_by_assignment_id`) references `assignments` (`id`) on delete SET NULL;
alter table `document_relations` add index `document_relations_related_document_id_relation_type_index`(`related_document_id`, `relation_type`);
create table `document_attachments` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `document_id` bigint unsigned not null, `file_asset_id` bigint unsigned not null, `uploaded_by_assignment_id` bigint unsigned, `attachment_type` varchar(80) not null default 'supporting_file', `title` varchar(180), `description` text, `status` varchar(40) not null default 'active', `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP, `deleted_at` timestamp null);
alter table `document_attachments` add unique `document_attachments_uuid_unique`(`uuid`);
alter table `document_attachments` add constraint `document_attachments_document_id_foreign` foreign key (`document_id`) references `documents` (`id`) on delete CASCADE;
alter table `document_attachments` add constraint `document_attachments_file_asset_id_foreign` foreign key (`file_asset_id`) references `file_assets` (`id`) on delete RESTRICT;
alter table `document_attachments` add constraint `document_attachments_uploaded_by_assignment_id_foreign` foreign key (`uploaded_by_assignment_id`) references `assignments` (`id`) on delete SET NULL;
alter table `document_attachments` add index `document_attachments_document_id_status_index`(`document_id`, `status`);
alter table `document_attachments` add index `document_attachments_file_asset_id_index`(`file_asset_id`);
create table `document_workflow_events` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `document_id` bigint unsigned not null, `actor_assignment_id` bigint unsigned not null, `action` varchar(80) not null, `required_action` varchar(80) null, `from_status` varchar(60), `to_status` varchar(60), `from_unit_id` bigint unsigned, `to_unit_id` bigint unsigned, `to_position_id` bigint unsigned, `note` text, `return_reason` text, `payload` json, `permissions` json null, `created_at` timestamp not null default CURRENT_TIMESTAMP);
alter table `document_workflow_events` add unique `document_workflow_events_uuid_unique`(`uuid`);
alter table `document_workflow_events` add constraint `document_workflow_events_document_id_foreign` foreign key (`document_id`) references `documents` (`id`) on delete CASCADE;
alter table `document_workflow_events` add constraint `document_workflow_events_actor_assignment_id_foreign` foreign key (`actor_assignment_id`) references `assignments` (`id`) on delete RESTRICT;
alter table `document_workflow_events` add constraint `document_workflow_events_from_unit_id_foreign` foreign key (`from_unit_id`) references `units` (`id`) on delete SET NULL;
alter table `document_workflow_events` add constraint `document_workflow_events_to_unit_id_foreign` foreign key (`to_unit_id`) references `units` (`id`) on delete SET NULL;
alter table `document_workflow_events` add constraint `document_workflow_events_to_position_id_foreign` foreign key (`to_position_id`) references `positions` (`id`) on delete SET NULL;
alter table `document_workflow_events` add index `document_workflow_events_document_id_created_at_index`(`document_id`, `created_at`);
alter table `document_workflow_events` add index `document_workflow_events_actor_assignment_id_created_at_index`(`actor_assignment_id`, `created_at`);
alter table `document_workflow_events` add index `document_workflow_events_action_created_at_index`(`action`, `created_at`);
alter table `document_workflow_events` add index `document_workflow_events_to_position_id_index`(`to_position_id`);
alter table `document_workflow_events` add index `doc_workflow_doc_req_action_idx`(`document_id`, `required_action`, `created_at`);
create table `document_tasks` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `document_id` bigint unsigned not null, `workflow_event_id` bigint unsigned, `created_by_assignment_id` bigint unsigned not null, `assigned_unit_id` bigint unsigned, `assigned_position_id` bigint unsigned, `assigned_assignment_id` bigint unsigned, `task_type` varchar(80) not null, `required_action` varchar(80) null, `requires_comment` boolean not null default '0', `can_review` boolean not null default '0', `can_edit` boolean not null default '0', `can_sign` boolean not null default '0', `can_forward` boolean not null default '0', `can_finalize` boolean not null default '0', `can_archive` boolean not null default '0', `status` varchar(60) not null default 'open', `title` varchar(180) not null, `description` text, `due_at` timestamp null, `completed_at` timestamp null, `completed_by_assignment_id` bigint unsigned, `responded_by_assignment_id` bigint unsigned null, `completion_note` text, `response_note` text null, `response_outcome` varchar(60) null, `payload` json null, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP, `deleted_at` timestamp null);
alter table `document_tasks` add unique `document_tasks_uuid_unique`(`uuid`);
alter table `document_tasks` add constraint `document_tasks_document_id_foreign` foreign key (`document_id`) references `documents` (`id`) on delete CASCADE;
alter table `document_tasks` add constraint `document_tasks_workflow_event_id_foreign` foreign key (`workflow_event_id`) references `document_workflow_events` (`id`) on delete SET NULL;
alter table `document_tasks` add constraint `document_tasks_created_by_assignment_id_foreign` foreign key (`created_by_assignment_id`) references `assignments` (`id`) on delete RESTRICT;
alter table `document_tasks` add constraint `document_tasks_assigned_unit_id_foreign` foreign key (`assigned_unit_id`) references `units` (`id`) on delete SET NULL;
alter table `document_tasks` add constraint `document_tasks_assigned_position_id_foreign` foreign key (`assigned_position_id`) references `positions` (`id`) on delete SET NULL;
alter table `document_tasks` add constraint `document_tasks_assigned_assignment_id_foreign` foreign key (`assigned_assignment_id`) references `assignments` (`id`) on delete SET NULL;
alter table `document_tasks` add constraint `document_tasks_completed_by_assignment_id_foreign` foreign key (`completed_by_assignment_id`) references `assignments` (`id`) on delete SET NULL;
alter table `document_tasks` add constraint `document_tasks_responded_by_assignment_id_foreign` foreign key (`responded_by_assignment_id`) references `assignments` (`id`) on delete SET NULL;
alter table `document_tasks` add index `document_tasks_document_id_status_index`(`document_id`, `status`);
alter table `document_tasks` add index `document_tasks_assigned_assignment_id_status_index`(`assigned_assignment_id`, `status`);
alter table `document_tasks` add index `document_tasks_assigned_unit_id_status_index`(`assigned_unit_id`, `status`);
alter table `document_tasks` add index `document_tasks_due_at_index`(`due_at`);
alter table `document_tasks` add index `doc_tasks_doc_req_status_idx`(`document_id`, `required_action`, `status`);
alter table `document_tasks` add index `doc_tasks_assignee_req_status_idx`(`assigned_unit_id`, `assigned_position_id`, `required_action`, `status`);
alter table `document_tasks` add index `document_tasks_responded_by_assignment_id_index`(`responded_by_assignment_id`);
alter table `document_tasks` add index `doc_tasks_requires_comment_idx`(`document_id`, `requires_comment`, `status`);
alter table `document_tasks` add index `doc_tasks_can_review_status_idx`(`document_id`, `can_review`, `status`);
alter table `document_tasks` add index `doc_tasks_doc_status_outcome_idx`(`document_id`, `status`, `response_outcome`);

-- Signatures and serial numbering.
create table `signature_profiles` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `user_id` bigint unsigned not null, `pin_hash` varchar(255) not null, `status` varchar(40) not null default 'active', `failed_pin_attempts` int unsigned not null default '0', `locked_until` timestamp null, `active_signature_asset_id` bigint unsigned, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP, `deleted_at` timestamp null);
alter table `signature_profiles` add unique `signature_profiles_uuid_unique`(`uuid`);
alter table `signature_profiles` add unique `signature_profiles_user_id_unique`(`user_id`);
alter table `signature_profiles` add constraint `signature_profiles_user_id_foreign` foreign key (`user_id`) references `users` (`id`) on delete CASCADE;
alter table `signature_profiles` add index `signature_profiles_status_index`(`status`);
create table `signature_assets` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `signature_profile_id` bigint unsigned not null, `file_asset_id` bigint unsigned not null, `status` varchar(40) not null default 'active', `processing_status` varchar(60) not null default 'accepted_without_background_removal', `encryption_algorithm` varchar(80) not null default 'aes-256-gcm', `accepted_at` timestamp null, `metadata` json, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP, `deleted_at` timestamp null);
alter table `signature_assets` add unique `signature_assets_uuid_unique`(`uuid`);
alter table `signature_assets` add constraint `signature_assets_signature_profile_id_foreign` foreign key (`signature_profile_id`) references `signature_profiles` (`id`) on delete CASCADE;
alter table `signature_assets` add constraint `signature_assets_file_asset_id_foreign` foreign key (`file_asset_id`) references `file_assets` (`id`) on delete RESTRICT;
alter table `signature_assets` add index `signature_assets_signature_profile_id_status_index`(`signature_profile_id`, `status`);
create table `pin_verification_events` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `user_id` bigint unsigned not null, `signature_profile_id` bigint unsigned, `assignment_id` bigint unsigned, `outcome` varchar(40) not null, `failure_reason` varchar(120), `ip_address` varchar(80), `user_agent` text, `created_at` timestamp not null default CURRENT_TIMESTAMP);
alter table `pin_verification_events` add unique `pin_verification_events_uuid_unique`(`uuid`);
alter table `pin_verification_events` add constraint `pin_verification_events_user_id_foreign` foreign key (`user_id`) references `users` (`id`) on delete CASCADE;
alter table `pin_verification_events` add constraint `pin_verification_events_signature_profile_id_foreign` foreign key (`signature_profile_id`) references `signature_profiles` (`id`) on delete SET NULL;
alter table `pin_verification_events` add constraint `pin_verification_events_assignment_id_foreign` foreign key (`assignment_id`) references `assignments` (`id`) on delete SET NULL;
alter table `pin_verification_events` add index `pin_verification_events_user_id_created_at_index`(`user_id`, `created_at`);
alter table `pin_verification_events` add index `pin_verification_events_outcome_created_at_index`(`outcome`, `created_at`);
create table `serial_rules` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `code` varchar(80) not null, `name` varchar(140) not null, `format` varchar(160) not null default 'DOC-{YEAR}-{SEQUENCE}', `scope` varchar(80) not null default 'global', `reset_policy` varchar(80) not null default 'yearly', `sequence_padding` int unsigned not null default '6', `is_default` boolean not null default '0', `status` varchar(40) not null default 'draft', `activated_by_user_id` bigint unsigned, `activated_at` timestamp null, `notes` text, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP);
alter table `serial_rules` add unique `serial_rules_uuid_unique`(`uuid`);
alter table `serial_rules` add unique `serial_rules_code_unique`(`code`);
alter table `serial_rules` add constraint `serial_rules_activated_by_user_id_foreign` foreign key (`activated_by_user_id`) references `users` (`id`) on delete SET NULL;
alter table `serial_rules` add index `serial_rules_status_is_default_index`(`status`, `is_default`);
create table `serial_sequences` (`id` bigint unsigned not null auto_increment primary key, `serial_rule_id` bigint unsigned not null, `sequence_scope` varchar(120) not null default 'global', `sequence_year` int unsigned not null, `sequence_period` varchar(20) not null, `current_value` bigint unsigned not null default '0', `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP);
alter table `serial_sequences` add unique `serial_seq_rule_scope_period_uq`(`serial_rule_id`, `sequence_scope`, `sequence_period`);
alter table `serial_sequences` add index `serial_sequences_serial_rule_id_index`(`serial_rule_id`);
alter table `serial_sequences` add constraint `serial_sequences_serial_rule_id_foreign` foreign key (`serial_rule_id`) references `serial_rules` (`id`) on delete CASCADE;
create table `serial_assignments` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `document_id` bigint unsigned not null, `serial_rule_id` bigint unsigned not null, `serial_sequence_id` bigint unsigned not null, `serial_value` varchar(160) not null, `assigned_by_assignment_id` bigint unsigned not null, `signature_event_id` bigint unsigned, `assigned_at` timestamp not null default CURRENT_TIMESTAMP, `metadata` json);
alter table `serial_assignments` add unique `serial_assignments_uuid_unique`(`uuid`);
alter table `serial_assignments` add unique `serial_assignments_document_id_unique`(`document_id`);
alter table `serial_assignments` add unique `serial_assignments_serial_value_unique`(`serial_value`);
alter table `serial_assignments` add constraint `serial_assignments_document_id_foreign` foreign key (`document_id`) references `documents` (`id`) on delete RESTRICT;
alter table `serial_assignments` add constraint `serial_assignments_serial_rule_id_foreign` foreign key (`serial_rule_id`) references `serial_rules` (`id`) on delete RESTRICT;
alter table `serial_assignments` add constraint `serial_assignments_serial_sequence_id_foreign` foreign key (`serial_sequence_id`) references `serial_sequences` (`id`) on delete RESTRICT;
alter table `serial_assignments` add constraint `serial_assignments_assigned_by_assignment_id_foreign` foreign key (`assigned_by_assignment_id`) references `assignments` (`id`) on delete RESTRICT;
alter table `serial_assignments` add index `serial_assignments_assigned_at_index`(`assigned_at`);
create table `signature_events` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `document_id` bigint unsigned not null, `document_task_id` bigint unsigned null, `user_id` bigint unsigned not null, `assignment_id` bigint unsigned not null, `signature_asset_id` bigint unsigned not null, `pin_verification_event_id` bigint unsigned not null, `document_version_number` int unsigned null, `document_hash` varchar(64) null, `response_note` text null, `print_options` json null, `serial_assignment_id` bigint unsigned, `status` varchar(40) not null default 'completed', `render_page` int unsigned, `render_x` decimal(10, 2), `render_y` decimal(10, 2), `render_width` decimal(10, 2), `render_height` decimal(10, 2), `ip_address` varchar(80), `user_agent` text, `created_at` timestamp not null default CURRENT_TIMESTAMP);
alter table `signature_events` add unique `signature_events_uuid_unique`(`uuid`);
alter table `signature_events` add constraint `signature_events_document_id_foreign` foreign key (`document_id`) references `documents` (`id`) on delete CASCADE;
alter table `signature_events` add constraint `signature_events_document_task_id_foreign` foreign key (`document_task_id`) references `document_tasks` (`id`) on delete SET NULL;
alter table `signature_events` add constraint `signature_events_user_id_foreign` foreign key (`user_id`) references `users` (`id`) on delete RESTRICT;
alter table `signature_events` add constraint `signature_events_assignment_id_foreign` foreign key (`assignment_id`) references `assignments` (`id`) on delete RESTRICT;
alter table `signature_events` add constraint `signature_events_signature_asset_id_foreign` foreign key (`signature_asset_id`) references `signature_assets` (`id`) on delete RESTRICT;
alter table `signature_events` add constraint `signature_events_pin_verification_event_id_foreign` foreign key (`pin_verification_event_id`) references `pin_verification_events` (`id`) on delete RESTRICT;
alter table `signature_events` add constraint `signature_events_serial_assignment_id_foreign` foreign key (`serial_assignment_id`) references `serial_assignments` (`id`) on delete SET NULL;
alter table `signature_events` add index `signature_events_document_id_created_at_index`(`document_id`, `created_at`);
alter table `signature_events` add index `signature_events_document_task_id_index`(`document_task_id`);
alter table `signature_events` add index `signature_events_document_hash_index`(`document_hash`);
alter table `serial_assignments` add constraint `serial_assignments_signature_event_id_foreign` foreign key (`signature_event_id`) references `signature_events` (`id`) on delete SET NULL;
create table `serial_repair_events` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `document_id` bigint unsigned not null, `serial_assignment_id` bigint unsigned, `admin_user_id` bigint unsigned, `admin_assignment_id` bigint unsigned, `repair_type` varchar(120) not null, `old_serial_value` varchar(160), `new_serial_value` varchar(160), `reason` text not null, `metadata` json, `created_at` timestamp not null default CURRENT_TIMESTAMP);
alter table `serial_repair_events` add unique `serial_repair_events_uuid_unique`(`uuid`);
alter table `serial_repair_events` add constraint `serial_repair_events_document_id_foreign` foreign key (`document_id`) references `documents` (`id`) on delete RESTRICT;
alter table `serial_repair_events` add constraint `serial_repair_events_serial_assignment_id_foreign` foreign key (`serial_assignment_id`) references `serial_assignments` (`id`) on delete SET NULL;
alter table `serial_repair_events` add constraint `serial_repair_events_admin_user_id_foreign` foreign key (`admin_user_id`) references `users` (`id`) on delete SET NULL;
alter table `serial_repair_events` add constraint `serial_repair_events_admin_assignment_id_foreign` foreign key (`admin_assignment_id`) references `assignments` (`id`) on delete SET NULL;
alter table `serial_repair_events` add index `serial_repair_events_document_id_created_at_index`(`document_id`, `created_at`);

-- Transmission, archive, notifications, search support, and integrations.
create table `external_organizations` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `code` varchar(80) not null, `name` varchar(180) not null, `organization_type` varchar(80) not null default 'external', `email` varchar(191), `phone` varchar(60), `address` text, `status` varchar(40) not null default 'active', `metadata` json, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP, `deleted_at` timestamp null);
alter table `external_organizations` add unique `external_organizations_uuid_unique`(`uuid`);
alter table `external_organizations` add unique `external_organizations_code_unique`(`code`);
alter table `external_organizations` add index `external_organizations_status_index`(`status`);
create table `external_recipients` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `external_organization_id` bigint unsigned not null, `full_name` varchar(180) not null, `position_title` varchar(140), `email` varchar(191), `phone` varchar(60), `is_authorized` boolean not null default '1', `status` varchar(40) not null default 'active', `metadata` json, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP, `deleted_at` timestamp null);
alter table `external_recipients` add unique `external_recipients_uuid_unique`(`uuid`);
alter table `external_recipients` add constraint `external_recipients_external_organization_id_foreign` foreign key (`external_organization_id`) references `external_organizations` (`id`) on delete CASCADE;
alter table `external_recipients` add index `ext_recip_org_status_idx`(`external_organization_id`, `status`);
alter table `external_recipients` add index `external_recipients_email_index`(`email`);
create table `retention_policies` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `code` varchar(80) not null, `name` varchar(160) not null, `retention_months` int unsigned, `disposition_action` varchar(80) not null default 'review', `is_default` boolean not null default '0', `status` varchar(40) not null default 'draft', `description` text, `created_by_user_id` bigint unsigned, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP);
alter table `retention_policies` add unique `retention_policies_uuid_unique`(`uuid`);
alter table `retention_policies` add unique `retention_policies_code_unique`(`code`);
alter table `retention_policies` add constraint `retention_policies_created_by_user_id_foreign` foreign key (`created_by_user_id`) references `users` (`id`) on delete SET NULL;
alter table `retention_policies` add index `ret_status_default_idx`(`status`, `is_default`);
create table `confidentiality_access_rules` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `confidentiality_level_id` bigint unsigned not null, `subject_type` varchar(80) not null, `role_id` bigint unsigned, `position_id` bigint unsigned, `unit_id` bigint unsigned, `unit_type_id` bigint unsigned, `access_level` varchar(80) not null default 'view_metadata', `can_view_content` boolean not null default '0', `can_download` boolean not null default '0', `can_print` boolean not null default '0', `requires_access_log` boolean not null default '1', `status` varchar(40) not null default 'active', `notes` text, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP);
alter table `confidentiality_access_rules` add unique `confidentiality_access_rules_uuid_unique`(`uuid`);
alter table `confidentiality_access_rules` add constraint `confidentiality_access_rules_confidentiality_level_id_foreign` foreign key (`confidentiality_level_id`) references `confidentiality_levels` (`id`) on delete CASCADE;
alter table `confidentiality_access_rules` add constraint `confidentiality_access_rules_role_id_foreign` foreign key (`role_id`) references `roles` (`id`) on delete CASCADE;
alter table `confidentiality_access_rules` add constraint `confidentiality_access_rules_position_id_foreign` foreign key (`position_id`) references `positions` (`id`) on delete CASCADE;
alter table `confidentiality_access_rules` add constraint `confidentiality_access_rules_unit_id_foreign` foreign key (`unit_id`) references `units` (`id`) on delete CASCADE;
alter table `confidentiality_access_rules` add constraint `confidentiality_access_rules_unit_type_id_foreign` foreign key (`unit_type_id`) references `unit_types` (`id`) on delete CASCADE;
alter table `confidentiality_access_rules` add index `conf_access_level_subject_idx`(`confidentiality_level_id`, `subject_type`, `status`);
create table `transmissions` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `document_id` bigint unsigned not null, `from_unit_id` bigint unsigned not null, `from_assignment_id` bigint unsigned not null, `transmission_type` varchar(80) not null, `visibility_policy` varchar(80) not null default 'show_all', `status` varchar(60) not null default 'sent', `subject_override` text, `message` text, `sent_at` timestamp null, `received_at` timestamp null, `acknowledged_at` timestamp null, `completed_at` timestamp null, `parent_transmission_id` bigint unsigned, `metadata` json, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP);
alter table `transmissions` add unique `transmissions_uuid_unique`(`uuid`);
alter table `transmissions` add constraint `transmissions_document_id_foreign` foreign key (`document_id`) references `documents` (`id`) on delete CASCADE;
alter table `transmissions` add constraint `transmissions_from_unit_id_foreign` foreign key (`from_unit_id`) references `units` (`id`) on delete RESTRICT;
alter table `transmissions` add constraint `transmissions_from_assignment_id_foreign` foreign key (`from_assignment_id`) references `assignments` (`id`) on delete RESTRICT;
alter table `transmissions` add constraint `transmissions_parent_transmission_id_foreign` foreign key (`parent_transmission_id`) references `transmissions` (`id`) on delete SET NULL;
alter table `transmissions` add index `transmissions_document_id_created_at_index`(`document_id`, `created_at`);
alter table `transmissions` add index `transmissions_from_unit_id_status_index`(`from_unit_id`, `status`);
alter table `transmissions` add index `trans_type_status_idx`(`transmission_type`, `status`);
create table `transmission_recipients` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `transmission_id` bigint unsigned not null, `recipient_type` varchar(80) not null, `to_unit_id` bigint unsigned, `to_assignment_id` bigint unsigned, `external_organization_id` bigint unsigned, `external_recipient_id` bigint unsigned, `recipient_label` varchar(180), `status` varchar(60) not null default 'sent', `received_at` timestamp null, `acknowledged_at` timestamp null, `completed_at` timestamp null, `received_by_assignment_id` bigint unsigned, `acknowledged_by_assignment_id` bigint unsigned, `note` text, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP);
alter table `transmission_recipients` add unique `transmission_recipients_uuid_unique`(`uuid`);
alter table `transmission_recipients` add constraint `transmission_recipients_transmission_id_foreign` foreign key (`transmission_id`) references `transmissions` (`id`) on delete CASCADE;
alter table `transmission_recipients` add constraint `transmission_recipients_to_unit_id_foreign` foreign key (`to_unit_id`) references `units` (`id`) on delete SET NULL;
alter table `transmission_recipients` add constraint `transmission_recipients_to_assignment_id_foreign` foreign key (`to_assignment_id`) references `assignments` (`id`) on delete SET NULL;
alter table `transmission_recipients` add constraint `transmission_recipients_external_organization_id_foreign` foreign key (`external_organization_id`) references `external_organizations` (`id`) on delete SET NULL;
alter table `transmission_recipients` add constraint `transmission_recipients_external_recipient_id_foreign` foreign key (`external_recipient_id`) references `external_recipients` (`id`) on delete SET NULL;
alter table `transmission_recipients` add constraint `transmission_recipients_received_by_assignment_id_foreign` foreign key (`received_by_assignment_id`) references `assignments` (`id`) on delete SET NULL;
alter table `transmission_recipients` add constraint `transmission_recipients_acknowledged_by_assignment_id_foreign` foreign key (`acknowledged_by_assignment_id`) references `assignments` (`id`) on delete SET NULL;
alter table `transmission_recipients` add index `trans_rec_trans_status_idx`(`transmission_id`, `status`);
alter table `transmission_recipients` add index `transmission_recipients_to_unit_id_status_index`(`to_unit_id`, `status`);
alter table `transmission_recipients` add index `trans_rec_assignment_status_idx`(`to_assignment_id`, `status`);
create table `document_renders` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `document_id` bigint unsigned not null, `transmission_id` bigint unsigned, `file_asset_id` bigint unsigned, `render_key` varchar(160) not null, `render_type` varchar(80) not null default 'html_definition', `visibility_policy` varchar(80) not null default 'show_all', `source_version_number` int unsigned, `document_hash` varchar(64) null, `verification_url` varchar(500) null, `status` varchar(60) not null default 'generated', `created_by_assignment_id` bigint unsigned, `render_definition` json, `metadata` json, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP);
alter table `document_renders` add unique `document_renders_uuid_unique`(`uuid`);
alter table `document_renders` add unique `document_renders_render_key_unique`(`render_key`);
alter table `document_renders` add constraint `document_renders_document_id_foreign` foreign key (`document_id`) references `documents` (`id`) on delete CASCADE;
alter table `document_renders` add constraint `document_renders_transmission_id_foreign` foreign key (`transmission_id`) references `transmissions` (`id`) on delete SET NULL;
alter table `document_renders` add constraint `document_renders_file_asset_id_foreign` foreign key (`file_asset_id`) references `file_assets` (`id`) on delete SET NULL;
alter table `document_renders` add constraint `document_renders_created_by_assignment_id_foreign` foreign key (`created_by_assignment_id`) references `assignments` (`id`) on delete SET NULL;
alter table `document_renders` add index `document_renders_document_id_created_at_index`(`document_id`, `created_at`);
alter table `document_renders` add index `document_renders_transmission_id_index`(`transmission_id`);
alter table `document_renders` add index `document_renders_document_hash_index`(`document_hash`);
create table `render_signature_visibility` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `document_render_id` bigint unsigned not null, `signature_event_id` bigint unsigned, `is_visible` boolean not null default '1', `visibility_reason` varchar(160), `visibility_policy` varchar(80) not null, `created_at` timestamp not null default CURRENT_TIMESTAMP);
alter table `render_signature_visibility` add unique `render_signature_visibility_uuid_unique`(`uuid`);
alter table `render_signature_visibility` add constraint `render_signature_visibility_document_render_id_foreign` foreign key (`document_render_id`) references `document_renders` (`id`) on delete CASCADE;
alter table `render_signature_visibility` add constraint `render_signature_visibility_signature_event_id_foreign` foreign key (`signature_event_id`) references `signature_events` (`id`) on delete SET NULL;
alter table `render_signature_visibility` add index `render_sig_render_visible_idx`(`document_render_id`, `is_visible`);
create table `archive_records` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `document_id` bigint unsigned not null, `archive_render_id` bigint unsigned, `retention_policy_id` bigint unsigned, `archived_by_assignment_id` bigint unsigned, `archive_status` varchar(60) not null default 'archived', `archived_at` timestamp not null default CURRENT_TIMESTAMP, `retention_review_at` timestamp null, `disposition_due_at` timestamp null, `reason` text, `metadata` json, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP);
alter table `archive_records` add unique `archive_records_uuid_unique`(`uuid`);
alter table `archive_records` add constraint `archive_records_document_id_foreign` foreign key (`document_id`) references `documents` (`id`) on delete RESTRICT;
alter table `archive_records` add constraint `archive_records_archive_render_id_foreign` foreign key (`archive_render_id`) references `document_renders` (`id`) on delete SET NULL;
alter table `archive_records` add constraint `archive_records_retention_policy_id_foreign` foreign key (`retention_policy_id`) references `retention_policies` (`id`) on delete SET NULL;
alter table `archive_records` add constraint `archive_records_archived_by_assignment_id_foreign` foreign key (`archived_by_assignment_id`) references `assignments` (`id`) on delete SET NULL;
alter table `archive_records` add index `archive_doc_status_idx`(`document_id`, `archive_status`);
alter table `archive_records` add index `archive_records_retention_review_at_index`(`retention_review_at`);
create table `delegations` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `delegator_assignment_id` bigint unsigned not null, `delegate_assignment_id` bigint unsigned not null, `created_by_user_id` bigint unsigned, `approved_by_user_id` bigint unsigned, `scope` varchar(120) not null default 'workflow_actions', `starts_at` datetime not null, `ends_at` datetime not null, `status` varchar(60) not null default 'active', `reason` text, `permissions` json, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP);
alter table `delegations` add unique `delegations_uuid_unique`(`uuid`);
alter table `delegations` add constraint `delegations_delegator_assignment_id_foreign` foreign key (`delegator_assignment_id`) references `assignments` (`id`) on delete CASCADE;
alter table `delegations` add constraint `delegations_delegate_assignment_id_foreign` foreign key (`delegate_assignment_id`) references `assignments` (`id`) on delete CASCADE;
alter table `delegations` add constraint `delegations_created_by_user_id_foreign` foreign key (`created_by_user_id`) references `users` (`id`) on delete SET NULL;
alter table `delegations` add constraint `delegations_approved_by_user_id_foreign` foreign key (`approved_by_user_id`) references `users` (`id`) on delete SET NULL;
alter table `delegations` add index `deleg_delegate_status_idx`(`delegate_assignment_id`, `status`);
alter table `delegations` add index `deleg_delegator_status_idx`(`delegator_assignment_id`, `status`);
create table `notifications` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `recipient_user_id` bigint unsigned not null, `recipient_assignment_id` bigint unsigned, `document_id` bigint unsigned, `transmission_id` bigint unsigned, `document_task_id` bigint unsigned null, `notification_type` varchar(120) not null, `channel` varchar(60) not null default 'in_app', `title` varchar(180) not null, `body` text, `status` varchar(60) not null default 'queued', `read_at` timestamp null, `sent_at` timestamp null, `failed_at` timestamp null, `failure_reason` text, `payload` json, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP);
alter table `notifications` add unique `notifications_uuid_unique`(`uuid`);
alter table `notifications` add constraint `notifications_recipient_user_id_foreign` foreign key (`recipient_user_id`) references `users` (`id`) on delete CASCADE;
alter table `notifications` add constraint `notifications_recipient_assignment_id_foreign` foreign key (`recipient_assignment_id`) references `assignments` (`id`) on delete SET NULL;
alter table `notifications` add constraint `notifications_document_id_foreign` foreign key (`document_id`) references `documents` (`id`) on delete CASCADE;
alter table `notifications` add constraint `notifications_transmission_id_foreign` foreign key (`transmission_id`) references `transmissions` (`id`) on delete CASCADE;
alter table `notifications` add constraint `notifications_document_task_id_foreign` foreign key (`document_task_id`) references `document_tasks` (`id`) on delete SET NULL;
alter table `notifications` add index `notif_user_status_idx`(`recipient_user_id`, `status`);
alter table `notifications` add index `notifications_document_id_created_at_index`(`document_id`, `created_at`);
alter table `notifications` add index `notifications_document_task_created_idx`(`document_task_id`, `created_at`);
create table `notification_preferences` (`id` bigint unsigned not null auto_increment primary key, `user_id` bigint unsigned not null, `notification_type` varchar(120) not null, `in_app_enabled` boolean not null default '1', `email_enabled` boolean not null default '0', `sms_enabled` boolean not null default '0', `settings` json, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP);
alter table `notification_preferences` add unique `notif_pref_user_type_uq`(`user_id`, `notification_type`);
alter table `notification_preferences` add constraint `notification_preferences_user_id_foreign` foreign key (`user_id`) references `users` (`id`) on delete CASCADE;
create table `document_comments` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `document_id` bigint unsigned not null, `parent_comment_id` bigint unsigned, `author_assignment_id` bigint unsigned not null, `visibility` varchar(60) not null default 'internal', `body` text not null, `status` varchar(60) not null default 'active', `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP, `deleted_at` timestamp null);
alter table `document_comments` add unique `document_comments_uuid_unique`(`uuid`);
alter table `document_comments` add constraint `document_comments_document_id_foreign` foreign key (`document_id`) references `documents` (`id`) on delete CASCADE;
alter table `document_comments` add constraint `document_comments_parent_comment_id_foreign` foreign key (`parent_comment_id`) references `document_comments` (`id`) on delete CASCADE;
alter table `document_comments` add constraint `document_comments_author_assignment_id_foreign` foreign key (`author_assignment_id`) references `assignments` (`id`) on delete RESTRICT;
alter table `document_comments` add index `document_comments_document_id_created_at_index`(`document_id`, `created_at`);
create table `saved_searches` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `user_id` bigint unsigned not null, `assignment_id` bigint unsigned, `name` varchar(140) not null, `search_type` varchar(80) not null default 'documents', `filters` json not null, `is_default` boolean not null default '0', `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP);
alter table `saved_searches` add unique `saved_searches_uuid_unique`(`uuid`);
alter table `saved_searches` add constraint `saved_searches_user_id_foreign` foreign key (`user_id`) references `users` (`id`) on delete CASCADE;
alter table `saved_searches` add constraint `saved_searches_assignment_id_foreign` foreign key (`assignment_id`) references `assignments` (`id`) on delete SET NULL;
alter table `saved_searches` add index `saved_search_user_type_idx`(`user_id`, `search_type`);
create table `document_ocr_text` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `document_id` bigint unsigned not null, `document_attachment_id` bigint unsigned, `file_asset_id` bigint unsigned, `language` varchar(20), `extracted_text` LONGTEXT, `confidence` decimal(5, 2), `ocr_engine` varchar(120), `status` varchar(60) not null default 'pending', `metadata` json, `processed_at` timestamp null, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP);
alter table `document_ocr_text` add unique `document_ocr_text_uuid_unique`(`uuid`);
alter table `document_ocr_text` add constraint `document_ocr_text_document_id_foreign` foreign key (`document_id`) references `documents` (`id`) on delete CASCADE;
alter table `document_ocr_text` add constraint `document_ocr_text_document_attachment_id_foreign` foreign key (`document_attachment_id`) references `document_attachments` (`id`) on delete CASCADE;
alter table `document_ocr_text` add constraint `document_ocr_text_file_asset_id_foreign` foreign key (`file_asset_id`) references `file_assets` (`id`) on delete SET NULL;
alter table `document_ocr_text` add index `document_ocr_text_document_id_status_index`(`document_id`, `status`);
create table `document_verification_tokens` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `document_id` bigint unsigned not null, `document_render_id` bigint unsigned, `token_hash` varchar(255) not null, `verification_scope` varchar(80) not null default 'internal', `status` varchar(60) not null default 'active', `expires_at` timestamp null, `revoked_at` timestamp null, `created_by_assignment_id` bigint unsigned, `metadata` json, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP);
alter table `document_verification_tokens` add unique `document_verification_tokens_uuid_unique`(`uuid`);
alter table `document_verification_tokens` add unique `document_verification_tokens_token_hash_unique`(`token_hash`);
alter table `document_verification_tokens` add constraint `document_verification_tokens_document_id_foreign` foreign key (`document_id`) references `documents` (`id`) on delete CASCADE;
alter table `document_verification_tokens` add constraint `document_verification_tokens_document_render_id_foreign` foreign key (`document_render_id`) references `document_renders` (`id`) on delete SET NULL;
alter table `document_verification_tokens` add constraint `document_verification_tokens_created_by_assignment_id_foreign` foreign key (`created_by_assignment_id`) references `assignments` (`id`) on delete SET NULL;
alter table `document_verification_tokens` add index `doc_verify_doc_status_idx`(`document_id`, `status`);
create table `api_clients` (`id` bigint unsigned not null auto_increment primary key, `uuid` char(36) not null, `client_id` varchar(120) not null, `client_secret_hash` varchar(255) not null, `name` varchar(160) not null, `status` varchar(60) not null default 'active', `scopes` json, `last_used_ip` varchar(80), `last_used_at` timestamp null, `created_by_user_id` bigint unsigned, `revoked_by_user_id` bigint unsigned, `revoked_at` timestamp null, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP);
alter table `api_clients` add unique `api_clients_uuid_unique`(`uuid`);
alter table `api_clients` add unique `api_clients_client_id_unique`(`client_id`);
alter table `api_clients` add constraint `api_clients_created_by_user_id_foreign` foreign key (`created_by_user_id`) references `users` (`id`) on delete SET NULL;
alter table `api_clients` add constraint `api_clients_revoked_by_user_id_foreign` foreign key (`revoked_by_user_id`) references `users` (`id`) on delete SET NULL;
alter table `api_clients` add index `api_clients_status_index`(`status`);

-- Reusable document templates.
create table `document_templates` (
  `id` bigint unsigned not null auto_increment primary key,
  `uuid` char(36) not null,
  `owner_user_id` bigint unsigned not null,
  `owner_assignment_id` bigint unsigned,
  `name` varchar(180) not null,
  `description` text,
  `status` varchar(60) not null default 'private_draft',
  `visibility` varchar(60) not null default 'private',
  `current_version_id` bigint unsigned,
  `created_at` timestamp not null default CURRENT_TIMESTAMP,
  `updated_at` timestamp not null default CURRENT_TIMESTAMP,
  `deleted_at` timestamp null
);
alter table `document_templates` add unique `document_templates_uuid_unique`(`uuid`);
alter table `document_templates` add constraint `document_templates_owner_user_id_foreign` foreign key (`owner_user_id`) references `users` (`id`) on delete RESTRICT;
alter table `document_templates` add constraint `document_templates_owner_assignment_id_foreign` foreign key (`owner_assignment_id`) references `assignments` (`id`) on delete SET NULL;
alter table `document_templates` add index `document_templates_owner_status_idx`(`owner_user_id`, `status`);
alter table `document_templates` add index `document_templates_status_visibility_idx`(`status`, `visibility`);

create table `document_template_versions` (
  `id` bigint unsigned not null auto_increment primary key,
  `uuid` char(36) not null,
  `template_id` bigint unsigned not null,
  `version_number` int unsigned not null,
  `status` varchar(60) not null default 'draft',
  `layout_definition` json not null,
  `created_by_user_id` bigint unsigned not null,
  `submitted_at` timestamp null,
  `submitted_by_user_id` bigint unsigned,
  `reviewed_at` timestamp null,
  `reviewed_by_user_id` bigint unsigned,
  `review_note` text,
  `created_at` timestamp not null default CURRENT_TIMESTAMP,
  `updated_at` timestamp not null default CURRENT_TIMESTAMP
);
alter table `document_template_versions` add unique `document_template_versions_uuid_unique`(`uuid`);
alter table `document_template_versions` add unique `doc_template_version_unique`(`template_id`, `version_number`);
alter table `document_template_versions` add constraint `document_template_versions_template_id_foreign` foreign key (`template_id`) references `document_templates` (`id`) on delete CASCADE;
alter table `document_template_versions` add constraint `document_template_versions_created_by_user_id_foreign` foreign key (`created_by_user_id`) references `users` (`id`) on delete RESTRICT;
alter table `document_template_versions` add constraint `document_template_versions_submitted_by_user_id_foreign` foreign key (`submitted_by_user_id`) references `users` (`id`) on delete SET NULL;
alter table `document_template_versions` add constraint `document_template_versions_reviewed_by_user_id_foreign` foreign key (`reviewed_by_user_id`) references `users` (`id`) on delete SET NULL;
alter table `document_template_versions` add index `doc_template_versions_status_idx`(`status`);

alter table `document_templates` add constraint `document_templates_current_version_id_foreign` foreign key (`current_version_id`) references `document_template_versions` (`id`) on delete SET NULL;

create table `document_template_bindings` (
  `id` bigint unsigned not null auto_increment primary key,
  `uuid` char(36) not null,
  `document_type_id` bigint unsigned,
  `locale` varchar(20) not null default 'all',
  `variant` varchar(80) not null default 'official',
  `template_id` bigint unsigned not null,
  `template_version_id` bigint unsigned not null,
  `status` varchar(60) not null default 'active',
  `created_by_user_id` bigint unsigned,
  `created_at` timestamp not null default CURRENT_TIMESTAMP,
  `updated_at` timestamp not null default CURRENT_TIMESTAMP
);
alter table `document_template_bindings` add unique `document_template_bindings_uuid_unique`(`uuid`);
alter table `document_template_bindings` add constraint `document_template_bindings_document_type_id_foreign` foreign key (`document_type_id`) references `document_types` (`id`) on delete CASCADE;
alter table `document_template_bindings` add constraint `document_template_bindings_template_id_foreign` foreign key (`template_id`) references `document_templates` (`id`) on delete CASCADE;
alter table `document_template_bindings` add constraint `document_template_bindings_template_version_id_foreign` foreign key (`template_version_id`) references `document_template_versions` (`id`) on delete CASCADE;
alter table `document_template_bindings` add constraint `document_template_bindings_created_by_user_id_foreign` foreign key (`created_by_user_id`) references `users` (`id`) on delete SET NULL;
alter table `document_template_bindings` add index `doc_template_binding_lookup_idx`(`document_type_id`, `locale`, `variant`, `status`);

create table `document_layout_drafts` (
  `id` bigint unsigned not null auto_increment primary key,
  `uuid` char(36) not null,
  `document_id` bigint unsigned not null,
  `owner_user_id` bigint unsigned not null,
  `owner_assignment_id` bigint unsigned,
  `base_template_version_id` bigint unsigned,
  `status` varchar(60) not null default 'draft',
  `layout_definition` json not null,
  `created_at` timestamp not null default CURRENT_TIMESTAMP,
  `updated_at` timestamp not null default CURRENT_TIMESTAMP,
  `deleted_at` timestamp null
);
alter table `document_layout_drafts` add unique `document_layout_drafts_uuid_unique`(`uuid`);
alter table `document_layout_drafts` add unique `document_layout_drafts_document_owner_unique`(`document_id`, `owner_user_id`);
alter table `document_layout_drafts` add constraint `document_layout_drafts_document_id_foreign` foreign key (`document_id`) references `documents` (`id`) on delete CASCADE;
alter table `document_layout_drafts` add constraint `document_layout_drafts_owner_user_id_foreign` foreign key (`owner_user_id`) references `users` (`id`) on delete RESTRICT;
alter table `document_layout_drafts` add constraint `document_layout_drafts_owner_assignment_id_foreign` foreign key (`owner_assignment_id`) references `assignments` (`id`) on delete SET NULL;
alter table `document_layout_drafts` add constraint `document_layout_drafts_base_template_version_id_foreign` foreign key (`base_template_version_id`) references `document_template_versions` (`id`) on delete SET NULL;
alter table `document_layout_drafts` add index `document_layout_drafts_document_status_idx`(`document_id`, `status`);

-- Global search index.
create table `global_search_index` (
  `id` bigint unsigned not null auto_increment primary key,
  `entity_type` varchar(80) not null,
  `entity_id` varchar(120) not null,
  `title` varchar(255) not null,
  `subtitle` varchar(255),
  `body` text,
  `keywords` text,
  `route_path` varchar(255) not null,
  `status` varchar(80),
  `metadata` json,
  `source_created_at` timestamp null,
  `source_updated_at` timestamp null,
  `indexed_at` timestamp not null default CURRENT_TIMESTAMP,
  `created_at` timestamp not null default CURRENT_TIMESTAMP,
  `updated_at` timestamp not null default CURRENT_TIMESTAMP,
  unique `global_search_entity_uq` (`entity_type`, `entity_id`),
  index `global_search_type_status_idx` (`entity_type`, `status`),
  index `global_search_route_path_idx` (`route_path`),
  fulltext index `global_search_title_fulltext_idx` (`title`),
  fulltext index `global_search_subtitle_fulltext_idx` (`subtitle`),
  fulltext index `global_search_body_fulltext_idx` (`body`),
  fulltext index `global_search_keywords_fulltext_idx` (`keywords`)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

-- Document write rules.
create table `document_write_rules` (
  `id` bigint unsigned not null auto_increment primary key,
  `uuid` char(36) not null,
  `document_type_id` bigint unsigned not null,
  `unit_type_id` bigint unsigned,
  `position_id` bigint unsigned,
  `role_id` bigint unsigned,
  `mode` varchar(20) not null default 'locked',
  `status` varchar(40) not null default 'active',
  `notes` text,
  `created_by_user_id` bigint unsigned,
  `created_at` timestamp not null default CURRENT_TIMESTAMP,
  `updated_at` timestamp not null default CURRENT_TIMESTAMP
);

alter table `document_write_rules`
  add unique `document_write_rules_uuid_unique`(`uuid`);

alter table `document_write_rules`
  add constraint `document_write_rules_document_type_id_foreign`
    foreign key (`document_type_id`) references `document_types` (`id`) on delete cascade;

alter table `document_write_rules`
  add constraint `document_write_rules_unit_type_id_foreign`
    foreign key (`unit_type_id`) references `unit_types` (`id`) on delete set null;

alter table `document_write_rules`
  add constraint `document_write_rules_position_id_foreign`
    foreign key (`position_id`) references `positions` (`id`) on delete set null;

alter table `document_write_rules`
  add constraint `document_write_rules_role_id_foreign`
    foreign key (`role_id`) references `roles` (`id`) on delete set null;

alter table `document_write_rules`
  add constraint `document_write_rules_created_by_user_id_foreign`
    foreign key (`created_by_user_id`) references `users` (`id`) on delete set null;

alter table `document_write_rules`
  add index `document_write_rules_lookup_idx`(`document_type_id`, `unit_type_id`, `position_id`, `role_id`, `status`);
