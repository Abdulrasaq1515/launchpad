"use client";

import { Bell, X, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { useState, useEffect } from "react";

export interface NotificationEntry {
  id: string;
  title: string;
  message: string;
  variant: "success" | "error" | "info";
  timestamp: number;
  read: boolean;
}

const MAX_NOTIFICATIONS = 15;
const STORAGE_KEY = "soropad_notifications";

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [now, setNow] = useState(0);

  // Load notifications from localStorage on mount. A lazy initializer cannot
  // be used because localStorage is unavailable during SSR, so state must be
  // seeded after hydration.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- external-store seed (localStorage), legitimate mount effect
        setNotifications(Array.isArray(parsed) ? parsed : []);
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Save notifications to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
    } catch {
      // Ignore storage errors
    }
  }, [notifications]);

  // Listen for custom notification events from toast provider
  useEffect(() => {
    const handleNotification = (event: Event) => {
      const custom = event as CustomEvent<NotificationEntry>;
      setNotifications((prev) => {
        const updated = [custom.detail, ...prev].slice(0, MAX_NOTIFICATIONS);
        return updated;
      });
    };

    window.addEventListener("soropad:notification", handleNotification);
    return () => {
      window.removeEventListener(
        "soropad:notification",
        handleNotification,
      );
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  const getIcon = (variant: NotificationEntry["variant"]) => {
    switch (variant) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-ok" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-danger" />;
      case "info":
        return <Info className="h-4 w-4 text-info" />;
    }
  };

  const formatTime = (timestamp: number) => {
    const seconds = Math.floor(((now || timestamp) - timestamp) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative rounded-lg border border-line bg-sunken p-2 text-muted transition-colors hover:bg-sunken hover:text-ink"
        aria-label="Notifications"
        aria-expanded={isOpen}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-info text-[0.75rem] font-medium text-ink">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-80 origin-top-right rounded-xl border border-line bg-sunken z-50">
            <div className="flex items-center justify-between border-b border-line/5 p-4">
              <h3 className="text-sm font-semibold text-ink">
                Notifications
              </h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-xs text-info hover:text-info"
                  >
                    Mark all read
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="text-xs text-muted hover:text-muted"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="mx-auto h-8 w-8 text-faint" />
                  <p className="mt-2 text-sm text-muted">
                    No notifications yet
                  </p>
                  <p className="mt-1 text-xs text-faint">
                    Transaction results will appear here
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-line/5">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-4 transition-colors hover:bg-sunken ${
                        !notification.read ? "bg-info-soft" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">
                          {getIcon(notification.variant)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-ink">
                              {notification.title}
                            </p>
                            <button
                              onClick={() => markAsRead(notification.id)}
                              className="shrink-0 text-muted hover:text-muted"
                              aria-label="Dismiss"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="mt-1 text-xs text-muted break-words">
                            {notification.message}
                          </p>
                          <p className="mt-1 text-[10px] text-faint">
                            {formatTime(notification.timestamp)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
