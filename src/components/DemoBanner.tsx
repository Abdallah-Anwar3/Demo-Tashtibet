import { IS_DEMO } from "@/lib/demo";

/** Thin strip shown on every page of the demo deployment. Renders nothing elsewhere. */
export default function DemoBanner() {
  if (!IS_DEMO) return null;
  return (
    <div
      className="bg-warn-soft px-3 py-1.5 text-center text-xs font-bold text-warn"
      role="note"
    >
      نسخة تجريبية: كل البيانات وهمية وتُعاد إلى حالتها الأصلية كل ساعة.
    </div>
  );
}
