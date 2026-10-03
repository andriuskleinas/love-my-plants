// Love My Plants service worker: push reminders with one-tap actions (plan F4).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "Your plants";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/192",
      badge: "/icons/192",
      tag: data.tag,
      data: { url: data.url || "/", taskIds: data.taskIds || [] },
      actions: data.taskIds && data.taskIds.length
        ? [
            { action: "done", title: "Done ✅" },
            { action: "snooze", title: "Snooze ⏰" },
          ]
        : [],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  const { url, taskIds } = event.notification.data || {};
  event.notification.close();

  if ((event.action === "done" || event.action === "snooze") && taskIds && taskIds.length) {
    event.waitUntil(
      fetch("/api/tasks/quick-action", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: event.action, taskIds }),
      }),
    );
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => "focus" in w);
      if (existing) {
        existing.navigate(url || "/");
        return existing.focus();
      }
      return self.clients.openWindow(url || "/");
    }),
  );
});
