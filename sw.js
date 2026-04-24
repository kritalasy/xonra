self.addEventListener("install", (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
    event.waitUntil((async () => {
        try {
            const response = await fetch("/api/notifications/latest", { cache: "no-store" });
            const payload = await response.json();
            const item = payload.notification;

            if (!item) {
                return;
            }

            await self.registration.showNotification(
                item.priority === "high" ? `Xonra Alert: ${item.title}` : item.title,
                {
                    body: item.message,
                    icon: "images/Xonra-logo.png",
                    badge: "images/Xonra-logo.png",
                    data: {
                        url: item.link || "news.html",
                        id: item.id
                    }
                }
            );
        } catch (error) {
            await self.registration.showNotification("Xonra update", {
                body: "A new update is available on the site.",
                icon: "images/Xonra-logo.png",
                badge: "images/Xonra-logo.png",
                data: {
                    url: "news.html"
                }
            });
        }
    })());
});

self.addEventListener("notificationclick", (event) => {
    const targetUrl = event.notification?.data?.url || "news.html";
    event.notification.close();

    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
            for (const client of clients) {
                if ("focus" in client) {
                    if ("navigate" in client) {
                        await client.navigate(targetUrl);
                    }
                    return client.focus();
                }
            }

            if (self.clients.openWindow) {
                return self.clients.openWindow(targetUrl);
            }

            return null;
        })
    );
});
