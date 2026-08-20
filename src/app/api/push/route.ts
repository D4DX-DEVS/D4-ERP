import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

// Web push delivery for in-app notifications. The browser subscribes through
// the OneSignal SDK (see components/onesignal-push.tsx) with the staff id as
// its external id, so a notification is addressed by staff id — no device
// registry of our own.
const APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
const REST_KEY = process.env.ONESIGNAL_REST_API_KEY;

// Matches how the app already works: any signed-in user can raise a
// notification for whoever needs to act on their request (staff -> dept head,
// dept head -> admin). Push mirrors that, so it is capped rather than
// role-gated: 30 sends/minute per user and 200 recipients per call.
const MAX_SENDS_PER_MINUTE = 30;
const MAX_RECIPIENTS = 200;

export async function POST(req: NextRequest) {
  // Any signed-in user may trigger a push, but only through this route: the
  // REST key never reaches the browser.
  const user = getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { allowed, retryAfterSeconds } = rateLimit(`push:${user.uid}`, MAX_SENDS_PER_MINUTE);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many notifications. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }
  if (!APP_ID || !REST_KEY) {
    // Not configured yet — in-app notifications still work, so this is not an error.
    return NextResponse.json({ sent: false, reason: "OneSignal not configured" });
  }

  const { recipientIds, title, message, link } = await req.json();
  const ids = (Array.isArray(recipientIds) ? recipientIds : [recipientIds]).filter(
    (id: unknown): id is string => typeof id === "string" && id.length > 0
  );
  if (!ids.length || typeof title !== "string" || typeof message !== "string") {
    return NextResponse.json({ error: "recipientIds, title and message are required" }, { status: 400 });
  }
  if (ids.length > MAX_RECIPIENTS) {
    return NextResponse.json({ error: `At most ${MAX_RECIPIENTS} recipients per push` }, { status: 400 });
  }
  // Tapping a push must land inside this app: an absolute URL would win over
  // the origin in new URL(), turning any notification into an open redirect.
  if (link && (typeof link !== "string" || !link.startsWith("/") || link.startsWith("//"))) {
    return NextResponse.json({ error: "link must be an app-relative path" }, { status: 400 });
  }

  try {
    const res = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${REST_KEY}`,
      },
      body: JSON.stringify({
        app_id: APP_ID,
        target_channel: "push",
        include_aliases: { external_id: ids },
        headings: { en: title },
        contents: { en: message },
        url: link ? new URL(link, req.nextUrl.origin).toString() : undefined,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("OneSignal push failed:", res.status, body);
      return NextResponse.json({ sent: false, reason: body?.errors ?? res.statusText }, { status: 502 });
    }
    // OneSignal answers 200 with an `errors` array when the alias exists but no
    // device is subscribed — report that instead of claiming a delivery.
    if (Array.isArray(body?.errors) && body.errors.length) {
      return NextResponse.json({ sent: false, reason: body.errors });
    }
    return NextResponse.json({ sent: true, id: body.id ?? null });
  } catch (error) {
    console.error("OneSignal push error:", error);
    return NextResponse.json({ sent: false, reason: "Push request failed" }, { status: 502 });
  }
}
