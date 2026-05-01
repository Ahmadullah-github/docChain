-- 006_document_templates up
-- Reusable A4 document templates, immutable versions, default bindings, and document-specific layout drafts.

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
