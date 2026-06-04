-- 008_placed_signature_events up
-- Store signer comments and print metadata for manually placed signatures.

alter table `signature_events`
  add column `response_note` text null after `document_hash`,
  add column `print_options` json null after `response_note`;
