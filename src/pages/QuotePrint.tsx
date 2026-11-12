import { useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { BRAND } from "@/config/brand";
import { quoteTotals, useQuote } from "@/hooks/useBusiness";
import { fmtDate, money } from "@/lib/format";

/** صفحة طباعة ورقية (بيضاء دائماً). اضغط «طباعة» ثم اختر «حفظ كـ PDF». */
export default function QuotePrint() {
  const { id } = useParams();
  const q = useQuote(id);
  if (q.isLoading) return <div className="p-10 text-center">جارٍ التحميل…</div>;
  if (!q.data)
    return <div className="p-10 text-center">المستند غير موجود.</div>;
  const { quote, items } = q.data;
  const t = quoteTotals(items, quote.discount, quote.tax_pct);
  const isQuote = quote.kind === "quote";

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-neutral-200 p-4 print:bg-white print:p-0"
    >
      <style>{`@media print { @page { size: A4; margin: 14mm } .no-print { display: none !important } }`}</style>
      <div className="no-print mx-auto mb-3 flex max-w-[820px] justify-end">
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-bold text-white"
        >
          <Printer className="h-4 w-4" /> طباعة / حفظ PDF
        </button>
      </div>
      <article className="mx-auto max-w-[820px] bg-white p-8 text-[13px] leading-6 text-neutral-900 shadow print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b-2 border-neutral-900 pb-4">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt={BRAND.name}
              className="h-16 w-auto object-contain"
            />
            <div>
              <div className="text-lg font-black">{BRAND.name}</div>
              <div className="text-xs text-neutral-600">{BRAND.tagline}</div>
              {BRAND.contact.whatsapp && (
                <div className="text-xs text-neutral-600" dir="ltr">
                  {BRAND.contact.whatsapp}
                </div>
              )}
            </div>
          </div>
          <div className="text-end">
            <div className="text-2xl font-black">
              {isQuote ? "عرض سعر" : "فاتورة"}
            </div>
            <div className="font-bold" dir="ltr">
              {quote.number}
            </div>
            <div className="text-xs text-neutral-600">
              التاريخ: {fmtDate(quote.issue_date)}
            </div>
            {quote.valid_until && (
              <div className="text-xs text-neutral-600">
                {isQuote ? "صالح حتى" : "الاستحقاق"}:{" "}
                {fmtDate(quote.valid_until)}
              </div>
            )}
          </div>
        </header>

        <section className="my-4">
          <div className="text-xs text-neutral-500">السادة / العميل</div>
          <div className="text-base font-black">{quote.client_name}</div>
          {quote.client_phone && (
            <div dir="ltr" className="text-xs text-neutral-600 text-end">
              {quote.client_phone}
            </div>
          )}
        </section>

        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-neutral-100 text-start">
              {["#", "البند", "الوحدة", "الكمية", "سعر الوحدة", "الإجمالي"].map(
                (h) => (
                  <th
                    key={h}
                    className="border border-neutral-300 px-2 py-1.5 text-start font-bold"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((x, i) => (
              <tr key={x.id}>
                <td className="border border-neutral-300 px-2 py-1.5">
                  {i + 1}
                </td>
                <td className="border border-neutral-300 px-2 py-1.5">
                  {x.description}
                </td>
                <td className="border border-neutral-300 px-2 py-1.5">
                  {x.unit}
                </td>
                <td className="border border-neutral-300 px-2 py-1.5" dir="ltr">
                  {x.qty}
                </td>
                <td className="border border-neutral-300 px-2 py-1.5" dir="ltr">
                  {money(x.unit_price)}
                </td>
                <td
                  className="border border-neutral-300 px-2 py-1.5 font-bold"
                  dir="ltr"
                >
                  {money(x.qty * x.unit_price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ms-auto mt-4 w-64 space-y-1">
          <div className="flex justify-between">
            <dt>المجموع</dt>
            <dd dir="ltr">{money(t.sub)}</dd>
          </div>
          {t.sub - t.afterDiscount > 0 && (
            <div className="flex justify-between">
              <dt>الخصم</dt>
              <dd dir="ltr">- {money(t.sub - t.afterDiscount)}</dd>
            </div>
          )}
          {t.tax > 0 && (
            <div className="flex justify-between">
              <dt>ضريبة {quote.tax_pct}%</dt>
              <dd dir="ltr">{money(t.tax)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t-2 border-neutral-900 pt-1 text-base font-black">
            <dt>الإجمالي</dt>
            <dd dir="ltr">{money(t.total)}</dd>
          </div>
        </dl>

        {quote.notes && (
          <section className="mt-6">
            <div className="font-bold">ملاحظات وشروط</div>
            <p className="whitespace-pre-line text-neutral-700">
              {quote.notes}
            </p>
          </section>
        )}

        <footer className="mt-12 grid grid-cols-2 gap-10 text-center text-xs text-neutral-600">
          <div className="border-t border-neutral-400 pt-1">
            توقيع {BRAND.name}
          </div>
          <div className="border-t border-neutral-400 pt-1">
            {isQuote ? "موافقة العميل" : "استلام العميل"}
          </div>
        </footer>
      </article>
    </div>
  );
}
