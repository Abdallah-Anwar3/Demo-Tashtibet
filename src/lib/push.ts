import { supabase } from "@/lib/supabase";

const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
export const PUSH_FLAG = "push-on";

const toBytes = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

export const pushIsOn = () => {
  try {
    return localStorage.getItem(PUSH_FLAG) === "1";
  } catch {
    return false;
  }
};

export type PushState =
  | "off"
  | "on"
  | "denied"
  | "install-first"
  | "unsupported";

const flag = (on: boolean) => {
  try {
    on
      ? localStorage.setItem(PUSH_FLAG, "1")
      : localStorage.removeItem(PUSH_FLAG);
  } catch {
    /* blocked */
  }
};

async function register(sub: PushSubscription) {
  const j = sub.toJSON();
  const { error } = await supabase.rpc("register_push", {
    p_endpoint: sub.endpoint,
    p_p256dh: j.keys?.p256dh ?? "",
    p_auth: j.keys?.auth ?? "",
    p_ua: navigator.userAgent,
  });
  if (error) throw new Error(error.message);
}

/** What the toggle should show on this device. Also re-registers an existing subscription for the signed-in user. */
export async function pushState(): Promise<PushState> {
  if (!KEY) return "unsupported";
  if (isIOS() && !isStandalone()) return "install-first"; // iOS only allows push for an installed PWA
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    return "unsupported";
  if (Notification.permission === "denied") {
    flag(false);
    return "denied";
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub && Notification.permission === "granted") {
      await register(sub);
      flag(true);
      return "on";
    }
  } catch {
    /* offline: fall through */
  }
  flag(false);
  return "off";
}

export async function enablePush(): Promise<PushState> {
  if (!KEY) return "unsupported";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "off";
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toBytes(KEY),
    }));
  await register(sub);
  flag(true);
  return "on";
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await supabase.rpc("unregister_push", { p_endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
  flag(false);
}
