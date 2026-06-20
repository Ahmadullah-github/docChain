-- 004_walk_in_issuance up
-- Production baseline for walk-in document issuance, print tracking, and physical handover records.

create table `external_persons` (
  `id` bigint unsigned not null auto_increment primary key,
  `uuid` char(36) not null,
  `first_name` varchar(120) not null,
  `last_name` varchar(120) not null,
  `father_name` varchar(120) not null,
  `phone_number` varchar(60) not null,
  `tazkira_number` varchar(120) not null,
  `address` text,
  `notes` text,
  `created_at` timestamp not null default CURRENT_TIMESTAMP,
  `updated_at` timestamp not null default CURRENT_TIMESTAMP,
  `deleted_at` timestamp null
);
alter table `external_persons` add unique `external_persons_uuid_unique`(`uuid`);
alter table `external_persons` add index `external_persons_name_index`(`first_name`, `last_name`, `father_name`);
alter table `external_persons` add index `external_persons_phone_number_index`(`phone_number`);
alter table `external_persons` add index `external_persons_tazkira_number_index`(`tazkira_number`);

create table `student_claimant_profiles` (
  `id` bigint unsigned not null auto_increment primary key,
  `uuid` char(36) not null,
  `external_person_id` bigint unsigned not null,
  `faculty_id` bigint unsigned not null,
  `department_id` bigint unsigned not null,
  `semester` varchar(40) not null,
  `academic_year` varchar(40),
  `student_registration_number` varchar(120),
  `student_status` varchar(80),
  `notes` text,
  `created_at` timestamp not null default CURRENT_TIMESTAMP,
  `updated_at` timestamp not null default CURRENT_TIMESTAMP
);
alter table `student_claimant_profiles` add unique `student_claimant_profiles_uuid_unique`(`uuid`);
alter table `student_claimant_profiles` add unique `student_claimant_profiles_person_unique`(`external_person_id`);
alter table `student_claimant_profiles` add constraint `student_claimant_profiles_external_person_id_foreign`
  foreign key (`external_person_id`) references `external_persons` (`id`) on delete CASCADE;
alter table `student_claimant_profiles` add constraint `student_claimant_profiles_faculty_id_foreign`
  foreign key (`faculty_id`) references `units` (`id`) on delete RESTRICT;
alter table `student_claimant_profiles` add constraint `student_claimant_profiles_department_id_foreign`
  foreign key (`department_id`) references `units` (`id`) on delete RESTRICT;
alter table `student_claimant_profiles` add index `student_claimant_profiles_faculty_department_index`(`faculty_id`, `department_id`);
alter table `student_claimant_profiles` add index `student_claimant_profiles_registration_index`(`student_registration_number`);

create table `document_issuance_requests` (
  `id` bigint unsigned not null auto_increment primary key,
  `uuid` char(36) not null,
  `document_id` bigint unsigned,
  `document_type_id` bigint unsigned not null,
  `requester_person_id` bigint unsigned not null,
  `subject_person_id` bigint unsigned not null,
  `taker_person_id` bigint unsigned not null,
  `taker_relationship_to_subject` varchar(80) not null,
  `handled_by_assignment_id` bigint unsigned not null,
  `handled_by_unit_id` bigint unsigned not null,
  `purpose` text,
  `destination_organization` varchar(255),
  `is_student` boolean not null default '0',
  `status` varchar(60) not null default 'intake',
  `created_at` timestamp not null default CURRENT_TIMESTAMP,
  `updated_at` timestamp not null default CURRENT_TIMESTAMP,
  `finalized_at` timestamp null,
  `handed_over_at` timestamp null,
  `archived_at` timestamp null,
  `canceled_at` timestamp null,
  `cancel_reason` text
);
alter table `document_issuance_requests` add unique `document_issuance_requests_uuid_unique`(`uuid`);
alter table `document_issuance_requests` add unique `document_issuance_requests_document_id_unique`(`document_id`);
alter table `document_issuance_requests` add constraint `document_issuance_requests_document_id_foreign`
  foreign key (`document_id`) references `documents` (`id`) on delete SET NULL;
alter table `document_issuance_requests` add constraint `document_issuance_requests_document_type_id_foreign`
  foreign key (`document_type_id`) references `document_types` (`id`) on delete RESTRICT;
alter table `document_issuance_requests` add constraint `document_issuance_requests_requester_person_id_foreign`
  foreign key (`requester_person_id`) references `external_persons` (`id`) on delete RESTRICT;
alter table `document_issuance_requests` add constraint `document_issuance_requests_subject_person_id_foreign`
  foreign key (`subject_person_id`) references `external_persons` (`id`) on delete RESTRICT;
alter table `document_issuance_requests` add constraint `document_issuance_requests_taker_person_id_foreign`
  foreign key (`taker_person_id`) references `external_persons` (`id`) on delete RESTRICT;
alter table `document_issuance_requests` add constraint `document_issuance_requests_handled_by_assignment_id_foreign`
  foreign key (`handled_by_assignment_id`) references `assignments` (`id`) on delete RESTRICT;
alter table `document_issuance_requests` add constraint `document_issuance_requests_handled_by_unit_id_foreign`
  foreign key (`handled_by_unit_id`) references `units` (`id`) on delete RESTRICT;
alter table `document_issuance_requests` add index `doc_issuance_status_created_idx`(`status`, `created_at`);
alter table `document_issuance_requests` add index `doc_issuance_type_status_idx`(`document_type_id`, `status`);
alter table `document_issuance_requests` add index `doc_issuance_handler_status_idx`(`handled_by_assignment_id`, `status`);

create table `document_print_events` (
  `id` bigint unsigned not null auto_increment primary key,
  `uuid` char(36) not null,
  `document_id` bigint unsigned not null,
  `issuance_request_id` bigint unsigned,
  `printed_by_assignment_id` bigint unsigned not null,
  `print_type` varchar(40) not null default 'original',
  `print_reason` text,
  `copy_number` int unsigned not null default '1',
  `printed_at` timestamp not null default CURRENT_TIMESTAMP
);
alter table `document_print_events` add unique `document_print_events_uuid_unique`(`uuid`);
alter table `document_print_events` add constraint `document_print_events_document_id_foreign`
  foreign key (`document_id`) references `documents` (`id`) on delete CASCADE;
alter table `document_print_events` add constraint `document_print_events_issuance_request_id_foreign`
  foreign key (`issuance_request_id`) references `document_issuance_requests` (`id`) on delete SET NULL;
alter table `document_print_events` add constraint `document_print_events_printed_by_assignment_id_foreign`
  foreign key (`printed_by_assignment_id`) references `assignments` (`id`) on delete RESTRICT;
alter table `document_print_events` add index `document_print_events_document_printed_idx`(`document_id`, `printed_at`);
alter table `document_print_events` add index `document_print_events_request_printed_idx`(`issuance_request_id`, `printed_at`);

create table `document_handover_records` (
  `id` bigint unsigned not null auto_increment primary key,
  `uuid` char(36) not null,
  `document_id` bigint unsigned not null,
  `issuance_request_id` bigint unsigned not null,
  `official_serial_number` varchar(120) not null,
  `taker_person_id` bigint unsigned not null,
  `handed_by_assignment_id` bigint unsigned not null,
  `handover_method` varchar(40) not null default 'physical_original',
  `copy_count` int unsigned not null default '1',
  `receiver_signature_asset_id` bigint unsigned,
  `receiver_thumbprint_asset_id` bigint unsigned,
  `printed_snapshot_id` bigint unsigned,
  `handover_note` text,
  `handed_over_at` timestamp not null default CURRENT_TIMESTAMP
);
alter table `document_handover_records` add unique `document_handover_records_uuid_unique`(`uuid`);
alter table `document_handover_records` add constraint `document_handover_records_document_id_foreign`
  foreign key (`document_id`) references `documents` (`id`) on delete CASCADE;
alter table `document_handover_records` add constraint `document_handover_records_issuance_request_id_foreign`
  foreign key (`issuance_request_id`) references `document_issuance_requests` (`id`) on delete CASCADE;
alter table `document_handover_records` add constraint `document_handover_records_taker_person_id_foreign`
  foreign key (`taker_person_id`) references `external_persons` (`id`) on delete RESTRICT;
alter table `document_handover_records` add constraint `document_handover_records_handed_by_assignment_id_foreign`
  foreign key (`handed_by_assignment_id`) references `assignments` (`id`) on delete RESTRICT;
alter table `document_handover_records` add constraint `document_handover_records_receiver_signature_asset_id_foreign`
  foreign key (`receiver_signature_asset_id`) references `file_assets` (`id`) on delete SET NULL;
alter table `document_handover_records` add constraint `document_handover_records_receiver_thumbprint_asset_id_foreign`
  foreign key (`receiver_thumbprint_asset_id`) references `file_assets` (`id`) on delete SET NULL;
alter table `document_handover_records` add constraint `document_handover_records_printed_snapshot_id_foreign`
  foreign key (`printed_snapshot_id`) references `document_renders` (`id`) on delete SET NULL;
alter table `document_handover_records` add index `document_handover_records_document_handed_idx`(`document_id`, `handed_over_at`);
alter table `document_handover_records` add index `document_handover_records_request_handed_idx`(`issuance_request_id`, `handed_over_at`);
alter table `document_handover_records` add index `document_handover_records_serial_index`(`official_serial_number`);
