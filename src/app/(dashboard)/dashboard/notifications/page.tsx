"use client";

import { useEffect, useState } from "react";
import { getDocuments, updateDocument, deleteDocument, orderBy, where, Timestamp } from "@/lib/firestore";
import { AppNotification } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, Trash2, Mail, AlertTriangle, Info, CheckCircle } from "lucide-react";
import { useToast } from "@/components/ui/toast";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  info: <Info className="h-5 w-5 text-blue-500" />,
  warning: <AlertTriangle className="h-5 w-5 text-orange-500" />,
  success: <CheckCircle className="h-5 w-5 text-green-500" />,
  error: <AlertTriangle className="h-5 w-5 text-red-500" />,
  reminder: <Bell className="h-5 w-5 text-purple-500" />,
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<(AppNotification & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await getDocuments<AppNotification>("notifications");
      setNotifications(data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const markAsRead = async (id: string) => {
    try {
      await updateDocument("notifications", id, { isRead: true, readAt: Timestamp.now() });
      fetchData();
    } catch (error) {
      toast("error", "Failed to mark as read");
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.isRead);
    for (const n of unread) {
      await updateDocument("notifications", n.id, { isRead: true, readAt: Timestamp.now() });
    }
    fetchData();
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDocument("notifications", id);
      toast("success", "Notification deleted");
      fetchData();
    } catch (error) {
      toast("error", "Failed to delete notification");
    }
  };

  const filtered = notifications.filter((n) => {
    if (filter === "unread") return !n.isRead;
    if (filter === "read") return n.isRead;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const timeAgo = (ts: { seconds: number } | undefined) => {
    if (!ts) return "";
    const diff = Date.now() - ts.seconds * 1000;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Notifications</h1>
          {unreadCount > 0 && (
            <Badge variant="bg-red-100 text-red-700">{unreadCount} unread</Badge>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <CheckCheck className="h-4 w-4 mr-2" /> Mark All Read
          </Button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(["all", "unread", "read"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mx-auto" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Bell className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No notifications</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => (
            <Card key={n.id} className={!n.isRead ? "border-l-4 border-l-blue-500" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{TYPE_ICONS[n.type] || TYPE_ICONS.info}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className={`text-sm ${!n.isRead ? "font-semibold" : "font-medium"}`}>{n.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap ml-2">{timeAgo(n.createdAt as { seconds: number })}</span>
                    </div>
                    <div className="flex gap-2 mt-2">
                      {!n.isRead && (
                        <Button variant="ghost" size="sm" onClick={() => markAsRead(n.id)}>
                          <CheckCheck className="h-3 w-3 mr-1" /> Read
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(n.id)}>
                        <Trash2 className="h-3 w-3 mr-1 text-red-400" /> Delete
                      </Button>
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
