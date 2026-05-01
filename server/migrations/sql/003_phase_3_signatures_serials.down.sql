-- 003_phase_3_signatures_serials.cjs down
-- SQL migration for MySQL.

drop table if exists `serial_repair_events`;
alter table `serial_assignments` drop foreign key `serial_assignments_signature_event_id_foreign`;
alter table `signature_slots` drop foreign key `signature_slots_completed_by_signature_event_id_foreign`;
drop table if exists `signature_events`;
drop table if exists `serial_assignments`;
drop table if exists `serial_sequences`;
drop table if exists `serial_rules`;
drop table if exists `signature_slots`;
drop table if exists `signature_rules`;
drop table if exists `pin_verification_events`;
drop table if exists `signature_assets`;
drop table if exists `signature_profiles`;
