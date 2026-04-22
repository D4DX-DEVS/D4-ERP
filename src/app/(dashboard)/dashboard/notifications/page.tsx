"use client";

import { useEffect, useState } from "react";
import { countDocuments, updateDocument, deleteDocument, where, Timestamp } from "@/lib/firestore";
import { AppNotification } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, Trash2, AlertTriangle, Info, CheckCircle } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  info: <Info className="h-5 w-5 text-blue-500" />,
  warning: <AlertTriangle className="h-5 w-5 text-orange-500" />,
  success: <CheckCircle className="h-5 w-5 text-green-500" />,
  error: <AlertTriangle className="h-5 w-5 text-red-500" />,
  reminder: <Bell className="h-5 w-5 text-purple-500" />,
};

export default function NotificationsPage() {
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [unreadCount, setUnreadCount] = useState(0);
  const { toast } = useToast();
  const {
    data: notifications,
    loading,
    totalCount,
    page,
    totalPages,
    hasNext,
    hasPrev,
    nextPage,
    prevPage,
    refresh,
  } = usePagination<AppNotification>("notifications", {
    pageSize: 10,
    orderByField: "createdAt",
    orderDirection: "desc",
    constraints:
      filter === "unread"
        ? [where("isRead", "==", false)]
        : filter === "read"
          ? [where("isRead", "==", true)]
          : [],
  });

  useEffect(() => {
    let isMounted = true;

    async function loadUnreadCount() {
      try {
        const total = await countDocuments("notifications", [where("isRead", "==", false)]);
        if (!isMounted) return;
        setUnreadCount(total);
      } catch (error) {
        console.error("Error:", error);
        if (isMounted) {
          toast("error", "Failed to load notifications");
        }
      }
    }

    void loadUnreadCount();

    return () => {
      isMounted = false;
    };
  }, [toast]);

  const refreshNotifications = async () => {
    try {
      const total = await countDocuments("notifications", [where("isRead", "==", false)]);
      setUnreadCount(total);
      refresh();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to load notifications");
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await updateDocument("notifications", id, { isRead: true, readAt: Timestamp.now() });
      await refreshNotifications();
    } catch {
      toast("error", "Failed to mark as read");
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.isRead);
    for (const n of unread) {
      await updateDocument("notifications", n.id, { isRead: true, readAt: Timestamp.now() });
    }
    await refreshNotifications();
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDocument("notifications", id);
      toast("success", "Notification deleted");
      await refreshNotifications();
    } catch {
      toast("error", "Failed to delete notification");
    }
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
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Bell className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No notifications</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
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
          <Pagination page={page} totalPages={totalPages} totalCount={totalCount} hasNext={hasNext} hasPrev={hasPrev} onNext={nextPage} onPrev={prevPage} pageSize={10} />
        </div>
      )}
    </div>
  );
}
