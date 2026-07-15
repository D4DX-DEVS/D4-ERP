"use client";

import { useEffect, useState } from "react";
import { countDocuments, createDocument, getDocuments, updateDocument, deleteDocument, orderBy, where, Timestamp } from "@/lib/firestore";
import { AppNotification, Department, Staff } from "@/types";
import { useAuthStore } from "@/store/auth-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileUpload } from "@/components/ui/file-upload";
import { Bell, CheckCheck, Trash2, AlertTriangle, Info, CheckCircle, Megaphone, Send, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  info: <Info className="h-5 w-5 text-blue-500" />,
  system: <Info className="h-5 w-5 text-blue-500" />,
  warning: <AlertTriangle className="h-5 w-5 text-orange-500" />,
  success: <CheckCircle className="h-5 w-5 text-green-500" />,
  error: <AlertTriangle className="h-5 w-5 text-red-500" />,
  reminder: <Bell className="h-5 w-5 text-purple-500" />,
  announcement: <Megaphone className="h-5 w-5 text-purple-500" />,
  event: <Bell className="h-5 w-5 text-teal-500" />,
  payroll: <CheckCircle className="h-5 w-5 text-emerald-500" />,
};

type Audience = "all" | "department" | "specific";

export default function NotificationsPage() {
  const { user } = useAuthStore();
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [unreadCount, setUnreadCount] = useState(0);
  const { toast } = useToast();

  // Compose state
  const [composeOpen, setComposeOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [staffList, setStaffList] = useState<(Staff & { id: string })[]>([]);
  const [departments, setDepartments] = useState<(Department & { id: string })[]>([]);
  const [compose, setCompose] = useState({
    title: "",
    message: "",
    type: "announcement" as AppNotification["type"],
    imageUrl: "",
    link: "",
    audience: "all" as Audience,
    departmentId: "",
    staffIds: [] as string[],
  });

  useEffect(() => {
    let isMounted = true;
    async function loadTargets() {
      try {
        const [staff, depts] = await Promise.all([
          getDocuments<Staff>("staff", [where("isActive", "==", true), orderBy("firstName", "asc")]),
          getDocuments<Department>("departments", [orderBy("name", "asc")]),
        ]);
        if (!isMounted) return;
        setStaffList(staff);
        setDepartments(depts);
      } catch (error) {
        console.error("Error:", error);
      }
    }
    void loadTargets();
    return () => {
      isMounted = false;
    };
  }, []);

  const resetCompose = () =>
    setCompose({ title: "", message: "", type: "announcement", imageUrl: "", link: "", audience: "all", departmentId: "", staffIds: [] });

  const resolveRecipients = (): (Staff & { id: string })[] => {
    if (compose.audience === "all") return staffList;
    if (compose.audience === "department") return staffList.filter((s) => s.departmentId === compose.departmentId);
    return staffList.filter((s) => compose.staffIds.includes(s.id));
  };

  const handleSend = async () => {
    if (!compose.title.trim() || !compose.message.trim()) {
      toast("error", "Title and message are required");
      return;
    }
    const recipients = resolveRecipients();
    if (recipients.length === 0) {
      toast("error", "No recipients match the selected audience");
      return;
    }
    setSending(true);
    try {
      const senderName = user ? `${user.firstName} ${user.lastName}` : "Admin";
      await Promise.all(
        recipients.map((s) =>
          createDocument("notifications", {
            recipientId: s.id,
            type: compose.type,
            title: compose.title.trim(),
            message: compose.message.trim(),
            imageUrl: compose.imageUrl || null,
            link: compose.link.trim() || null,
            senderName,
            isRead: false,
            createdAt: Timestamp.now(),
          })
        )
      );
      toast("success", `Notification sent to ${recipients.length} staff`);
      setComposeOpen(false);
      resetCompose();
      await refreshNotifications();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to send notification");
    } finally {
      setSending(false);
    }
  };

  const toggleStaff = (id: string) =>
    setCompose((prev) => ({
      ...prev,
      staffIds: prev.staffIds.includes(id) ? prev.staffIds.filter((s) => s !== id) : [...prev.staffIds, id],
    }));
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
    constraints: [
      // Only this admin's own notifications — not every staff member's copies.
      where("recipientId", "==", user?.uid ?? ""),
      ...(filter === "unread"
        ? [where("isRead", "==", false)]
        : filter === "read"
          ? [where("isRead", "==", true)]
          : []),
    ],
  });

  useEffect(() => {
    let isMounted = true;

    async function loadUnreadCount() {
      if (!user) return;
      try {
        const total = await countDocuments("notifications", [
          where("recipientId", "==", user.uid),
          where("isRead", "==", false),
        ]);
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
  }, [toast, user]);

  const refreshNotifications = async () => {
    if (!user) return;
    try {
      const total = await countDocuments("notifications", [
        where("recipientId", "==", user.uid),
        where("isRead", "==", false),
      ]);
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
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              <CheckCheck className="h-4 w-4 mr-2" /> Mark All Read
            </Button>
          )}
          <Button size="sm" onClick={() => setComposeOpen(true)}>
            <Send className="h-4 w-4 mr-2" /> Send Notification
          </Button>
        </div>
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
                    {n.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={n.imageUrl} alt={n.title} className="mt-2 max-h-48 rounded-xl border border-slate-200 object-contain" />
                    )}
                    {n.senderName && <p className="mt-1 text-[11px] text-gray-400">From {n.senderName}</p>}
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

      <Dialog open={composeOpen} onClose={() => setComposeOpen(false)} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Send Notification</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input value={compose.title} onChange={(e) => setCompose({ ...compose, title: e.target.value })} placeholder="e.g. Office closed on Friday" />
          </div>
          <div className="space-y-2">
            <Label>Message *</Label>
            <Textarea value={compose.message} onChange={(e) => setCompose({ ...compose, message: e.target.value })} rows={3} placeholder="Write the notification details..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={compose.type}
                onChange={(e) => setCompose({ ...compose, type: e.target.value as AppNotification["type"] })}
                options={[
                  { value: "announcement", label: "Announcement" },
                  { value: "system", label: "System" },
                  { value: "event", label: "Event" },
                  { value: "payroll", label: "Payroll" },
                ]}
              />
            </div>
            <div className="space-y-2">
              <Label>Audience</Label>
              <Select
                value={compose.audience}
                onChange={(e) => setCompose({ ...compose, audience: e.target.value as Audience })}
                options={[
                  { value: "all", label: "All active staff" },
                  { value: "department", label: "By department" },
                  { value: "specific", label: "Specific staff" },
                ]}
              />
            </div>
          </div>

          {compose.audience === "department" && (
            <div className="space-y-2">
              <Label>Department</Label>
              <Select
                value={compose.departmentId}
                onChange={(e) => setCompose({ ...compose, departmentId: e.target.value })}
                placeholder="Select department"
                options={departments.map((d) => ({ value: d.id, label: d.name }))}
              />
            </div>
          )}

          {compose.audience === "specific" && (
            <div className="space-y-2">
              <Label>Select staff ({compose.staffIds.length} selected)</Label>
              <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 p-2">
                {staffList.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                    <input type="checkbox" checked={compose.staffIds.includes(s.id)} onChange={() => toggleStaff(s.id)} />
                    <span>{s.firstName} {s.lastName}</span>
                    <span className="text-xs text-gray-400">{s.employeeCode}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Image (optional)</Label>
            <FileUpload value={compose.imageUrl} onChange={(url) => setCompose({ ...compose, imageUrl: url })} folder="notifications" accept="image/*" preview="image" />
          </div>

          <div className="space-y-2">
            <Label>Link (optional)</Label>
            <Input value={compose.link} onChange={(e) => setCompose({ ...compose, link: e.target.value })} placeholder="/dashboard/calendar" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setComposeOpen(false)} disabled={sending}>Cancel</Button>
            <Button onClick={handleSend} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />} Send
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
