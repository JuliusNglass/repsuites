-- Reply-SEND reminders for gated free checks use steps 4 and 5 in
-- check_followups (steps 1-3 stay the report follow-ups).
alter table public.check_followups drop constraint if exists check_followups_step_check;
alter table public.check_followups
  add constraint check_followups_step_check check (step between 1 and 5);
