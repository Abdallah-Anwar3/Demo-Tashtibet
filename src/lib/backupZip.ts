import { supabase } from "@/lib/supabase";

/** Tables → Arabic file names. Every table becomes one CSV that opens in Excel. */
const TABLES: [string, string][] = [
  ["projects", "المشاريع"],
  ["profiles", "المستخدمون"],
  ["project_clients", "ربط العملاء بالمشاريع"],
  ["attendance", "الحضور"],
  ["daily_reports", "التقارير اليومية"],
  ["custody_wallets", "محافظ العهد"],
  ["expenses", "المصروفات"],
  ["payroll_records", "المرتبات"],
  ["project_stage_history", "سجل المراحل"],
  ["client_updates", "تقارير العملاء"],
  ["project_payments", "دفعات العملاء"],
  ["client_requests", "طلبات العملاء"],
  ["client_request_messages", "رسائل الطلبات"],
  ["stage_ratings", "تقييمات المراحل"],
  ["stage_approvals", "اعتماد المراحل"],
  ["project_milestones", "الجدول الزمني"],
  ["suppliers", "الموردون"],
  ["supplier_invoices", "فواتير الموردين"],
  ["boq_items", "المقايسة"],
  ["quotes", "عروض الأسعار"],
  ["quote_items", "بنود عروض الأسعار"],
  ["change_orders", "أوامر التغيير"],
  ["subcontracts", "مقاولو الباطن"],
  ["subcontract_payments", "دفعات مقاولي الباطن"],
  ["custody_returns", "مرتجعات العهد"],
  ["supplier_payments", "دفعات الموردين"],
  ["materials", "الخامات"],
  ["stock_moves", "حركة المخزون"],
];

/* ---------- CSV ---------- */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cell = (v: unknown) => {
  const s =
    v === null || v === undefined
      ? ""
      : typeof v === "object"
        ? JSON.stringify(v)
        : String(v);
  return `"${s.replace(/"/g, '""')}"`;
};

/** Rows → CSV text. A column that holds an id of a known person/project/supplier/material gets a name column beside it. */
function toCSV(rows: Record<string, unknown>[], names: Map<string, string>) {
  if (!rows.length) return "﻿";
  const keys: string[] = [];
  const withName = new Set<string>();
  for (const r of rows)
    for (const k of Object.keys(r)) {
      if (!keys.includes(k)) keys.push(k);
      const v = r[k];
      if (typeof v === "string" && UUID.test(v) && names.has(v) && k !== "id")
        withName.add(k);
    }
  const head = keys.flatMap((k) =>
    withName.has(k) ? [k, `${k} (الاسم)`] : [k],
  );
  const lines = rows.map((r) =>
    keys
      .flatMap((k) => {
        const v = r[k];
        return withName.has(k)
          ? [cell(v), cell(typeof v === "string" ? (names.get(v) ?? "") : "")]
          : [cell(v)];
      })
      .join(","),
  );
  return "﻿" + [head.map(cell).join(","), ...lines].join("\r\n");
}

/* ---------- minimal ZIP writer (stored, no compression, UTF-8 names) ---------- */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function zip(files: { name: string; data: Uint8Array }[]): Blob {
  const enc = new TextEncoder();
  const d = new Date();
  const time =
    (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date =
    ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, 0, true);
    lh.setUint16(10, time, true);
    lh.setUint16(12, date, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, f.data.length, true);
    lh.setUint32(22, f.data.length, true);
    lh.setUint16(26, name.length, true);
    lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true);
    ch.setUint16(14, date, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, f.data.length, true);
    ch.setUint32(24, f.data.length, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const size = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return new Blob(
    [...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[],
    { type: "application/zip" },
  );
}

/* ---------- public ---------- */
async function readAll(table: string) {
  const all: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    all.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < 1000) break;
  }
  return all;
}

/** One .zip with a readable Excel (CSV) file per table. Photos and receipts are not included. */
export async function downloadBackupZip(onProgress?: (label: string) => void) {
  const data: Record<string, Record<string, unknown>[]> = {};
  for (const [t, label] of TABLES) {
    onProgress?.(label);
    data[t] = await readAll(t);
  }

  const names = new Map<string, string>();
  const put = (t: string, field: string) =>
    data[t]?.forEach((r) => {
      if (typeof r.id === "string" && r[field])
        names.set(r.id, String(r[field]));
    });
  put("profiles", "full_name");
  put("projects", "title");
  put("suppliers", "name");
  put("materials", "name");

  const enc = new TextEncoder();
  const files = TABLES.filter(([t]) => data[t].length).map(([t, label]) => ({
    name: `${label}.csv`,
    data: enc.encode(toCSV(data[t], names)),
  }));
  const today = new Date().toISOString().slice(0, 10);
  files.unshift({
    name: "اقرأني.txt",
    data: enc.encode(
      "﻿" +
        [
          `نسخة احتياطية من بيانات الشركة — ${today}`,
          "",
          "كل ملف في هذا المجلد جدول يُفتح مباشرة بـ Excel.",
          "الأعمدة التي تنتهي بـ «(الاسم)» تعرض اسم الشخص أو المشروع المرتبط بالرقم المجاور لها.",
          "الصور والإيصالات غير مضمّنة (تبقى محفوظة في النظام).",
          "",
          "الملفات:",
          ...TABLES.filter(([t]) => data[t].length).map(
            ([, l]) => `- ${l}.csv`,
          ),
        ].join("\r\n"),
    ),
  });
  const url = URL.createObjectURL(zip(files));
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `نسخة-احتياطية-${today}.zip`,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
