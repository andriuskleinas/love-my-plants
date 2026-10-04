// Love My Plants service worker: push reminders with one-tap actions (plan F4).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "Your plants";
  const hasTasks = data.taskIds && data.taskIds.length > 0;

  // Tell open app windows a push arrived (Settings uses this to diagnose hidden notifications).
  const notifyClients = self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((wins) => wins.forEach((w) => w.postMessage({ type: "push-received", tag: data.tag })));

  const show = self.registration.showNotification(title, {
    body: data.body || "",
    icon: "/icons/192",
    badge: "/icons/192",
    tag: data.tag,
    // Re-alert when a notification with the same tag replaces an earlier one.
    renotify: Boolean(data.tag),
    data: { url: data.url || "/", taskIds: data.taskIds || [] },
    actions: hasTasks
      ? [
          { action: "done", title: "Done ✅" },
          { action: "snooze", title: "Snooze ⏰" },
        ]
      : [],
  });

  event.waitUntil(Promise.all([notifyClients, show]));
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
      })
        .then((res) => {
          if (res.ok) return;
          const why =
            res.status === 409
              ? "it was already answered (maybe by someone else)"
              : res.status === 401
              ? "you're signed out of the app"
              : res.status === 429
                ? "too many requests were made"
                : "of a problem on our side";
          return showFailure(`Your answer wasn't saved because ${why}. Open the app to answer there.`, url);
        })
        .catch(() => showFailure("Your answer wasn't saved because your phone was offline. Open the app to answer there.", url)),
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

function showFailure(body, url) {
  return self.registration.showNotification("⚠️ Not saved", {
    body,
    icon: "/icons/192",
    tag: "quick-action-failed",
    data: { url: url || "/", taskIds: [] },
  });
}
