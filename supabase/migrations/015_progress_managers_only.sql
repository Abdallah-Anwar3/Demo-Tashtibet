-- 015: نسبة إنجاز المشروع يحدّثها المدير ومدير المشاريع فقط. التقرير اليومي لم يعد يغيّرها.
CREATE OR REPLACE FUNCTION public.trg_report_after_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE eng text; proj text;
BEGIN
  IF COALESCE(btrim(NEW.issues), '') <> '' THEN
    SELECT full_name INTO eng FROM public.profiles WHERE id = NEW.engineer_id;
    SELECT title INTO proj FROM public.projects WHERE id = NEW.project_id;
    PERFORM public.notify_managers('report', 'تقرير يومي يتضمن معوقات',
      COALESCE(eng, '') || ' · ' || COALESCE(proj, ''), '/admin/reports');
  END IF;
  RETURN NEW;
END $$;
