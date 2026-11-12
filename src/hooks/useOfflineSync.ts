import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { uploadImages } from "@/lib/imageUtils";
import { localDB } from "@/lib/db";

const DUP = "23505"; // unique_violation: the row was already synced on an earlier attempt

/**
 * Pushes reports and expenses saved offline to Supabase when the connection returns.
 * Inserts are idempotent through the unique `offline_id` column.
 *
 * Attendance is deliberately NOT queued offline: check-in/out run through server
 * RPCs that stamp the server time and verify the geofence, so they need a connection.
 */
export function useOfflineSync() {
  const qc = useQueryClient();
  const busy = useRef(false);
  const [online, setOnline] = useState(navigator.onLine);

  const pending =
    useLiveQuery(async () => {
      const [r, e] = await Promise.all([
        localDB.pendingReports
          .where("syncStatus")
          .anyOf("pending", "failed")
          .count(),
        localDB.pendingExpenses
          .where("syncStatus")
          .anyOf("pending", "failed")
          .count(),
      ]);
      return r + e;
    }, []) ?? 0;

  const sync = useCallback(async () => {
    if (busy.current || !navigator.onLine) return;
    busy.current = true;
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) return;

      for (const r of await localDB.pendingReports
        .where("syncStatus")
        .anyOf("pending", "failed")
        .toArray()) {
        try {
          const photos = r.photos.length
            ? await uploadImages(
                r.photos,
                `${r.engineerId}/${r.offlineId}`,
                "site-reports",
              )
            : [];
          const { error } = await supabase.from("daily_reports").insert({
            offline_id: r.offlineId,
            project_id: r.projectId,
            engineer_id: r.engineerId,
            completed_work: r.completedWork,
            remaining_work: r.remainingWork,
            issues: r.issues,
            notes: r.notes,
            photos_urls: photos,
            date: r.date,
            progress_pct: null,
          });
          if (error && error.code !== DUP) throw error;
          await localDB.pendingReports.update(r.id!, {
            syncStatus: "synced",
            photos: [],
            lastError: undefined,
          });
        } catch (e) {
          await localDB.pendingReports.update(r.id!, {
            syncStatus: "failed",
            lastError: (e as Error).message,
          });
        }
      }

      for (const x of await localDB.pendingExpenses
        .where("syncStatus")
        .anyOf("pending", "failed")
        .toArray()) {
        try {
          const receipt = x.receipt
            ? (
                await uploadImages(
                  [x.receipt],
                  `${x.engineerId}/${x.offlineId}`,
                  "receipts",
                )
              )[0]
            : null;
          // custody_id and status are set by a server trigger (migration 003)
          const { error } = await supabase.from("expenses").insert({
            offline_id: x.offlineId,
            project_id: x.projectId,
            engineer_id: x.engineerId,
            amount: x.amount,
            category: x.category,
            description: x.description,
            receipt_url: receipt,
          });
          if (error && error.code !== DUP) throw error;
          await localDB.pendingExpenses.update(x.id!, {
            syncStatus: "synced",
            receipt: undefined,
            lastError: undefined,
          });
        } catch (e) {
          await localDB.pendingExpenses.update(x.id!, {
            syncStatus: "failed",
            lastError: (e as Error).message,
          });
        }
      }
      await qc.invalidateQueries();
    } finally {
      busy.current = false;
    }
  }, [qc]);

  useEffect(() => {
    const up = () => {
      setOnline(true);
      void sync();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    void sync();
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [sync]);

  return { online, pending, sync };
}
