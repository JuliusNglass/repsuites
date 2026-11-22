-- First lead text within 3-4 minutes of the form (was up to 6 with a
-- 3-minute cron). The chase itself still waits 3 minutes before step 1.
select cron.alter_job((select jobid from cron.job where jobname = 'repsuites-growth-chase'), schedule := '* * * * *');
