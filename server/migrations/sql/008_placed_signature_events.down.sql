-- 008_placed_signature_events down

alter table `signature_events`
  drop column `print_options`,
  drop column `response_note`;
