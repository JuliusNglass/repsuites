-- Growth chase every 3 minutes so new leads get their first text within minutes, any hour.
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'repsuites-growth-chase';
  perform cron.schedule('repsuites-growth-chase', '*/3 * * * *', 'select repsuites_private.run_growth_chase()');
end $$;
