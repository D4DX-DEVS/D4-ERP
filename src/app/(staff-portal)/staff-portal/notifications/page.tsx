"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { getDocuments, updateDocument, where, orderBy, Timestamp } from "@/lib/firestore";
import { AppNotification } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, AlertTriangle, Info, CheckCircle, Megaphone } from "lucide-react";
import { useToast } from "@/components/ui/toast";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  info: <Info className="h-5 w-5 text-blue-500" />,
  system: <Info className="h-5 w-5 text-blue-500" />,
  warning: <AlertTriangle className="h-5 w-5 text-orange-500" />,
  success: <CheckCircle className="h-5 w-5 text-green-500" />,
  announcement: <Megaphone className="h-5 w-5 text-purple-500" />,
  event: <Bell className="h-5 w-5 text-teal-500" />,
  payroll: <CheckCircle className="h-5 w-5 text-emerald-500" />,
};

export default function StaffNotificationsPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<(AppNotification & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const data = await getDocuments<AppNotification>("notifications", [
        where("recipientId", "==", user.staffId),
        orderBy("createdAt", "desc"),
      ]);
      setNotifications(data);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    async function load() {
      await fetchNotifications();
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const markAsRead = async (id: string) => {
    try {
      await updateDocument("notifications", id, { isRead: true, readAt: Timestamp.now() });
      await fetchNotifications();
    } catch {
      toast("error", "Failed to mark as read");
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.isRead);
    await Promise.all(unread.map((n) => updateDocument("notifications", n.id, { isRead: true, readAt: Timestamp.now() })));
    await fetchNotifications();
  };

  const timeAgo = (ts: { seconds: number } | undefined) => {
    if (!ts) return "";
    return new Date(ts.seconds * 1000).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const visible = filter === "unread" ? notifications.filter((n) => !n.isRead) : notifications;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">Notifications</h1>
          {unreadCount > 0 && <Badge variant="bg-red-100 text-red-700">{unreadCount} unread</Badge>}
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <CheckCheck className="h-4 w-4 mr-2" /> Mark all read
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        {(["all", "unread"] as const).map((f) => (
          <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent mx-auto" />
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Bell className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">You&apos;re all caught up</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((n) => (
            <Card key={n.id} className={!n.isRead ? "border-l-4 border-l-emerald-500" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{TYPE_ICONS[n.type] || TYPE_ICONS.info}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <p className={`text-sm ${!n.isRead ? "font-semibold" : "font-medium"}`}>{n.title}</p>
                      <span className="text-xs text-gray-400 whitespace-nowrap ml-2">{timeAgo(n.createdAt as { seconds: number })}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{n.message}</p>
                    {n.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={n.imageUrl} alt={n.title} className="mt-2 max-h-60 rounded-xl border border-slate-200 object-contain" />
                    )}
                    {n.link && (
                      <a href={n.link} className="mt-2 inline-block text-xs font-medium text-teal-700 hover:underline">
                        View details →
                      </a>
                    )}
                    <div className="mt-2 flex items-center gap-3">
                      {n.senderName && <span className="text-[11px] text-gray-400">From {n.senderName}</span>}
                      {!n.isRead && (
                        <Button variant="ghost" size="sm" onClick={() => markAsRead(n.id)}>
                          <CheckCheck className="h-3 w-3 mr-1" /> Mark read
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
