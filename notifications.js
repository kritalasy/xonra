(() => {
    const LOCAL_FEED_KEY = "xonra-notification-feed";
    const PREFS_KEY = "xonra-notification-prefs";
    const ADMIN_HASH_KEY = "xonra-admin-hash";
    const DEFAULT_ADMIN_HASH = "fe88422601fcc6f3908c3488a60d63b8a8d8b06bdae3251a9bd4578a9c6cb92a";
    const MAX_ITEMS = 60;
    const CHANNELS = [
        { id: "website", label: "Website updates" },
        { id: "games", label: "Game news" },
        { id: "community", label: "Community posts" },
        { id: "events", label: "Events and launches" }
    ];
    const DEFAULT_FEED = [
        {
            id: "seed-website-refresh",
            title: "Xonra website refresh is live",
            message: "The site now has a cleaner layout, a news hub, and more room for team updates.",
            link: "news.html",
            channel: "website",
            priority: "high",
            status: "published",
            publishedAt: "2026-04-18T10:00:00.000Z",
            scheduledAt: "",
            createdAt: "2026-04-18T10:00:00.000Z"
        },
        {
            id: "seed-community-roadmap",
            title: "Community feedback now shapes the roadmap",
            message: "Discord feedback is helping the team decide what to improve first and what to build next.",
            link: "news.html",
            channel: "community",
            priority: "normal",
            status: "published",
            publishedAt: "2026-04-19T12:00:00.000Z",
            scheduledAt: "",
            createdAt: "2026-04-19T12:00:00.000Z"
        }
    ];

    const state = {
        apiAvailable: false,
        pushConfigured: false,
        publicKey: null,
        feed: [],
        stats: null,
        adminSession: false,
        loading: true
    };

    function safeJsonParse(value, fallback) {
        try {
            return value ? JSON.parse(value) : fallback;
        } catch (error) {
            return fallback;
        }
    }

    function readStorage(key, fallback) {
        return safeJsonParse(localStorage.getItem(key), fallback);
    }

    function writeStorage(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function uid(prefix) {
        return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatDate(value, withTime = false) {
        if (!value) return "Not set";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "Invalid date";

        return new Intl.DateTimeFormat("en", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: withTime ? "numeric" : undefined,
            minute: withTime ? "2-digit" : undefined
        }).format(date);
    }

    function getDefaultPrefs() {
        return {
            browserEnabled: false,
            permission: typeof Notification !== "undefined" ? Notification.permission : "unsupported",
            muted: false,
            topics: CHANNELS.map((channel) => channel.id),
            lastSeenId: null,
            lastDeliveredId: null,
            subscribedAt: null
        };
    }

    function getPrefs() {
        return {
            ...getDefaultPrefs(),
            ...readStorage(PREFS_KEY, {})
        };
    }

    function savePrefs(nextPrefs) {
        const merged = { ...getPrefs(), ...nextPrefs };
        writeStorage(PREFS_KEY, merged);
        return merged;
    }

    function normalizeItem(item) {
        return {
            id: item.id || uid("note"),
            title: item.title || "Untitled update",
            message: item.message || "",
            link: item.link || "news.html",
            channel: item.channel || "website",
            priority: item.priority || "normal",
            status: item.status || "published",
            publishedAt: item.publishedAt || "",
            scheduledAt: item.scheduledAt || "",
            createdAt: item.createdAt || new Date().toISOString()
        };
    }

    function seedLocalFeedIfEmpty() {
        const existing = readStorage(LOCAL_FEED_KEY, []);
        if (existing.length) return;
        writeStorage(LOCAL_FEED_KEY, DEFAULT_FEED);
    }

    function getLocalFeed() {
        seedLocalFeedIfEmpty();
        return readStorage(LOCAL_FEED_KEY, DEFAULT_FEED).map(normalizeItem).slice(0, MAX_ITEMS);
    }

    function saveLocalFeed(items) {
        writeStorage(LOCAL_FEED_KEY, items.map(normalizeItem).slice(0, MAX_ITEMS));
    }

    function getFeed() {
        return (state.feed.length ? state.feed : getLocalFeed()).slice(0, MAX_ITEMS);
    }

    function getStats() {
        if (state.stats) return state.stats;
        const feed = getFeed();
        return {
            total: feed.length,
            published: feed.filter((item) => item.status === "published").length,
            scheduled: feed.filter((item) => item.status === "scheduled").length,
            drafts: feed.filter((item) => item.status === "draft").length,
            subscribers: 0
        };
    }

    function getPublishedNotifications() {
        return getFeed()
            .filter((item) => item.status === "published")
            .sort((left, right) => new Date(right.publishedAt) - new Date(left.publishedAt));
    }

    function getVisibleNotifications() {
        const prefs = getPrefs();
        return getPublishedNotifications().filter((item) => prefs.topics.includes(item.channel));
    }

    function getUnreadCount() {
        const prefs = getPrefs();
        const notifications = getVisibleNotifications();
        if (!notifications.length) return 0;
        if (!prefs.lastSeenId) return notifications.length;

        const lastSeenIndex = notifications.findIndex((item) => item.id === prefs.lastSeenId);
        return lastSeenIndex === -1 ? notifications.length : lastSeenIndex;
    }

    function markAllSeen() {
        const latest = getVisibleNotifications()[0];
        if (!latest) return;
        savePrefs({ lastSeenId: latest.id });
    }

    function matchesPermission() {
        return typeof window !== "undefined" && "Notification" in window;
    }

    async function sha256(value) {
        const source = new TextEncoder().encode(String(value || "").trim());
        const digest = await crypto.subtle.digest("SHA-256", source);
        return Array.from(new Uint8Array(digest))
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
    }

    async function requestJson(path, options = {}) {
        try {
            const response = await fetch(path, options);
            const data = await response.json().catch(() => ({}));
            return { ok: response.ok, status: response.status, data };
        } catch (error) {
            return { ok: false, status: 0, data: { error: error.message } };
        }
    }

    async function registerServiceWorker() {
        if (!("serviceWorker" in navigator)) return null;
        try {
            return await navigator.serviceWorker.register("./sw.js");
        } catch (error) {
            return null;
        }
    }

    function urlBase64ToUint8Array(base64String) {
        const padding = "=".repeat((4 - (base64String.length % 4 || 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
        const rawData = window.atob(base64);
        return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
    }

    async function getPushSubscription() {
        if (!("serviceWorker" in navigator)) return null;
        const registration = await navigator.serviceWorker.ready.catch(() => null);
        if (!registration || !registration.pushManager) {
            return null;
        }

        return registration.pushManager.getSubscription();
    }

    async function subscribeCurrentDevice(topics = getPrefs().topics) {
        if (!state.apiAvailable || !state.pushConfigured || !state.publicKey) {
            return { ok: false, reason: "server-unavailable" };
        }

        const registration = await navigator.serviceWorker.ready.catch(() => null);
        if (!registration || !registration.pushManager) {
            return { ok: false, reason: "push-unsupported" };
        }

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(state.publicKey)
            });
        }

        const response = await requestJson("/api/push/subscribe", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                subscription: subscription.toJSON(),
                topics,
                userAgent: navigator.userAgent
            })
        });

        if (response.ok) {
            savePrefs({
                browserEnabled: true,
                subscribedAt: new Date().toISOString()
            });
        }

        return response;
    }

    async function unsubscribeCurrentDevice() {
        const subscription = await getPushSubscription();
        if (!subscription) return;

        if (state.apiAvailable) {
            await requestJson("/api/push/unsubscribe", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    endpoint: subscription.endpoint
                })
            });
        }

        await subscription.unsubscribe().catch(() => null);
        savePrefs({
            browserEnabled: false,
            subscribedAt: null
        });
    }

    async function requestPermission() {
        if (!matchesPermission()) {
            return "unsupported";
        }

        const permission = await Notification.requestPermission();
        savePrefs({
            permission,
            browserEnabled: permission === "granted",
            subscribedAt: permission === "granted" ? new Date().toISOString() : null
        });

        if (permission === "granted") {
            await subscribeCurrentDevice();
        }

        return permission;
    }

    async function showBrowserNotification(item, force = false) {
        const prefs = getPrefs();
        if (!force && (!prefs.browserEnabled || prefs.muted || prefs.lastDeliveredId === item.id)) {
            return false;
        }

        const permission = matchesPermission() ? Notification.permission : "unsupported";
        if (permission !== "granted") {
            return false;
        }

        const registration = await navigator.serviceWorker.ready.catch(() => null);
        const title = item.priority === "high" ? `Xonra Alert: ${item.title}` : item.title;
        const options = {
            body: item.message,
            icon: "images/Xonra-logo.png",
            badge: "images/Xonra-logo.png",
            data: {
                url: item.link || "news.html",
                id: item.id
            }
        };

        if (registration) {
            await registration.showNotification(title, options);
        } else {
            new Notification(title, options);
        }

        savePrefs({ lastDeliveredId: item.id });
        return true;
    }

    async function deliverLatestNotification() {
        const latest = getVisibleNotifications()[0];
        if (!latest) return false;
        return showBrowserNotification(latest);
    }

    async function refreshFeed() {
        if (!state.apiAvailable) {
            state.feed = getLocalFeed();
            return state.feed;
        }

        const response = await requestJson("/api/notifications/feed");
        if (response.ok && Array.isArray(response.data.feed)) {
            state.feed = response.data.feed.map(normalizeItem);
            state.stats = response.data.stats || null;
            return state.feed;
        }

        state.feed = getLocalFeed();
        return state.feed;
    }

    function getStoredAdminHash() {
        return sessionStorage.getItem(ADMIN_HASH_KEY) || "";
    }

    async function verifyAdminSession(adminHash = getStoredAdminHash()) {
        if (!adminHash) {
            state.adminSession = false;
            return false;
        }

        if (!state.apiAvailable) {
            state.adminSession = adminHash === DEFAULT_ADMIN_HASH;
            return state.adminSession;
        }

        const response = await requestJson("/api/admin/session", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-admin-hash": adminHash
            },
            body: JSON.stringify({ adminHash })
        });

        state.adminSession = response.ok;
        if (!response.ok) {
            sessionStorage.removeItem(ADMIN_HASH_KEY);
        }

        return response.ok;
    }

    async function loginAdmin(passcode) {
        const adminHash = await sha256(passcode);
        const isValid = await verifyAdminSession(adminHash);
        if (isValid) {
            sessionStorage.setItem(ADMIN_HASH_KEY, adminHash);
        }
        return isValid;
    }

    async function loadAdminFeed() {
        const adminHash = getStoredAdminHash();
        if (!adminHash || !state.apiAvailable) {
            return { ok: false };
        }

        const response = await requestJson("/api/admin/feed", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-admin-hash": adminHash
            },
            body: JSON.stringify({ adminHash })
        });

        if (response.ok && Array.isArray(response.data.feed)) {
            state.feed = response.data.feed.map(normalizeItem);
            state.stats = response.data.stats || null;
        }

        return response;
    }

    async function publishNotification(values) {
        if (!state.apiAvailable) {
            const item = normalizeItem({
                id: values.id || uid("note"),
                title: values.title.trim(),
                message: values.message.trim(),
                link: values.link.trim() || "news.html",
                channel: values.channel,
                priority: values.priority,
                status: values.status,
                scheduledAt: values.status === "scheduled" ? values.scheduledAt : "",
                publishedAt: values.status === "published" ? new Date().toISOString() : "",
                createdAt: values.createdAt || new Date().toISOString()
            });
            const feed = getLocalFeed();
            const existingIndex = feed.findIndex((entry) => entry.id === item.id);
            if (existingIndex >= 0) {
                feed[existingIndex] = item;
            } else {
                feed.unshift(item);
            }
            saveLocalFeed(feed);
            state.feed = getLocalFeed();
            return { ok: true, data: { notification: item, delivery: { deliveredCount: 0 } } };
        }

        const adminHash = getStoredAdminHash();
        const response = await requestJson("/api/admin/publish", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-admin-hash": adminHash
            },
            body: JSON.stringify({
                adminHash,
                notification: values
            })
        });

        if (response.ok) {
            await loadAdminFeed();
        }

        return response;
    }

    async function deleteNotification(id) {
        if (!state.apiAvailable) {
            saveLocalFeed(getLocalFeed().filter((item) => item.id !== id));
            state.feed = getLocalFeed();
            return { ok: true };
        }

        const adminHash = getStoredAdminHash();
        const response = await requestJson("/api/admin/delete", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-admin-hash": adminHash
            },
            body: JSON.stringify({ adminHash, id })
        });

        if (response.ok) {
            await loadAdminFeed();
        }

        return response;
    }

    function renderChannelOptions(selected) {
        return CHANNELS.map((channel) => {
            const isChecked = selected.includes(channel.id) ? "checked" : "";
            return `
                <label class="xr-chip-option">
                    <input type="checkbox" name="topic" value="${channel.id}" ${isChecked}>
                    <span>${channel.label}</span>
                </label>
            `;
        }).join("");
    }

    function renderFeedList(items, emptyMessage) {
        if (!items.length) {
            return `<div class="xr-empty-state">${escapeHtml(emptyMessage)}</div>`;
        }

        return items.map((item) => `
            <article class="xr-feed-card priority-${escapeHtml(item.priority)}">
                <div class="xr-feed-card-top">
                    <span class="xr-pill">${escapeHtml(item.channel)}</span>
                    <time datetime="${escapeHtml(item.publishedAt || item.scheduledAt)}">${escapeHtml(formatDate(item.publishedAt || item.scheduledAt, true))}</time>
                </div>
                <h3>${escapeHtml(item.title)}</h3>
                <p>${escapeHtml(item.message)}</p>
                <a href="${escapeHtml(item.link)}" class="xr-inline-link">Open update</a>
            </article>
        `).join("");
    }

    function mountSettingsPanel(root) {
        const prefs = getPrefs();
        const permission = matchesPermission() ? Notification.permission : "unsupported";
        const visibleNotifications = getVisibleNotifications().slice(0, 4);
        const stats = getStats();
        const deviceStatus = prefs.browserEnabled && state.pushConfigured ? "Connected" : prefs.browserEnabled ? "Allowed" : "Disabled";

        root.innerHTML = `
            <div class="xr-card-grid">
                <section class="xr-panel">
                    <div class="xr-panel-heading">
                        <div>
                            <p class="xr-eyebrow">Notification hub</p>
                            <h3>Stay in the loop</h3>
                        </div>
                        <span class="xr-status-badge ${prefs.browserEnabled ? "is-live" : ""}">
                            ${escapeHtml(deviceStatus)}
                        </span>
                    </div>
                    <p class="xr-muted">
                        Enable browser notifications for launches, website updates, and team announcements.
                    </p>
                    <div class="xr-actions-row">
                        <button type="button" class="xr-primary-btn" data-action="enable-notifications">
                            ${permission === "granted" ? "Reconnect this device" : "Enable browser notifications"}
                        </button>
                        <button type="button" class="xr-secondary-btn" data-action="test-notification">Send test alert</button>
                        <button type="button" class="xr-text-btn" data-action="disable-notifications">Disconnect device</button>
                    </div>
                    <p class="xr-helper-text">
                        Browser permission: <strong>${escapeHtml(permission)}</strong>
                    </p>
                    <p class="xr-helper-text">
                        Audience reached right now: <strong>${stats.subscribers || 0}</strong> subscribed devices
                    </p>
                </section>

                <section class="xr-panel">
                    <div class="xr-panel-heading">
                        <div>
                            <p class="xr-eyebrow">Topics</p>
                            <h3>Choose what reaches you</h3>
                        </div>
                    </div>
                    <form class="xr-topics-form">
                        <div class="xr-chip-grid">
                            ${renderChannelOptions(prefs.topics)}
                        </div>
                        <label class="xr-toggle-row">
                            <input type="checkbox" name="muted" ${prefs.muted ? "checked" : ""}>
                            <span>Mute browser pop-ups while keeping updates in the inbox</span>
                        </label>
                        <button type="submit" class="xr-secondary-btn">Save preferences</button>
                    </form>
                </section>
            </div>

            <section class="xr-panel">
                <div class="xr-panel-heading">
                    <div>
                        <p class="xr-eyebrow">Recent updates</p>
                        <h3>Your notification inbox</h3>
                    </div>
                    <button type="button" class="xr-text-btn" data-action="mark-all-seen">
                        Mark all as seen
                    </button>
                </div>
                <div class="xr-feed-list">
                    ${renderFeedList(visibleNotifications, "No announcements match your current topics yet.")}
                </div>
                <a href="admin.html" class="xr-inline-link xr-admin-shortcut">Open admin dashboard</a>
            </section>
        `;

        root.querySelector('[data-action="enable-notifications"]')?.addEventListener("click", async () => {
            const result = await requestPermission();
            if (result === "granted") {
                await deliverLatestNotification();
                await refreshFeed();
            }
            renderAll();
        });

        root.querySelector('[data-action="disable-notifications"]')?.addEventListener("click", async () => {
            await unsubscribeCurrentDevice();
            renderAll();
        });

        root.querySelector('[data-action="test-notification"]')?.addEventListener("click", async () => {
            const item = {
                id: uid("preview"),
                title: "Test notification from Xonra",
                message: "This device is ready to receive site-wide updates.",
                link: "settings.html",
                priority: "normal"
            };
            await showBrowserNotification(item, true);
        });

        root.querySelector('[data-action="mark-all-seen"]')?.addEventListener("click", () => {
            markAllSeen();
            renderAll();
        });

        root.querySelector(".xr-topics-form")?.addEventListener("submit", async (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const topics = formData.getAll("topic");
            savePrefs({
                topics: topics.length ? topics : CHANNELS.map((channel) => channel.id),
                muted: formData.get("muted") === "on"
            });

            if (matchesPermission() && Notification.permission === "granted") {
                await subscribeCurrentDevice(getPrefs().topics);
            }

            renderAll();
        });
    }

    function mountNewsPanel(root) {
        const items = getVisibleNotifications().slice(0, 3);
        const unread = getUnreadCount();
        const stats = getStats();

        root.innerHTML = `
            <section class="xr-panel xr-news-panel">
                <div class="xr-panel-heading">
                    <div>
                        <p class="xr-eyebrow">Live notification feed</p>
                        <h3>Fresh from the admin dashboard</h3>
                    </div>
                    <span class="xr-count-badge">${unread} unread</span>
                </div>
                <p class="xr-muted">
                    These cards mirror the server-side feed. When an admin publishes, it can fan out to all ${stats.subscribers || 0} subscribed devices.
                </p>
                <div class="xr-feed-list">
                    ${renderFeedList(items, "No live announcements have been published yet.")}
                </div>
                <div class="xr-actions-row">
                    <button type="button" class="xr-primary-btn" data-action="enable-notifications">Enable alerts</button>
                    <a href="admin.html" class="xr-secondary-btn xr-link-btn">Manage in admin</a>
                </div>
            </section>
        `;

        root.querySelector('[data-action="enable-notifications"]')?.addEventListener("click", async () => {
            await requestPermission();
            await deliverLatestNotification();
            renderAll();
        });
    }

    function mountHeroCta(root) {
        const prefs = getPrefs();
        const latest = getVisibleNotifications()[0];
        const stats = getStats();

        root.innerHTML = `
            <div class="xr-banner">
                <div>
                    <p class="xr-eyebrow">Live push system</p>
                    <h3>Turn on Xonra notifications</h3>
                    <p class="xr-muted">
                        ${latest ? escapeHtml(latest.title) : "Get the next launch and community post as soon as it drops."}
                    </p>
                    <p class="xr-helper-text">
                        Current reach: ${stats.subscribers || 0} subscribed devices
                    </p>
                </div>
                <div class="xr-actions-row">
                    <button type="button" class="xr-primary-btn" data-action="enable-notifications">
                        ${prefs.browserEnabled ? "Reconnect this device" : "Enable alerts"}
                    </button>
                    <a href="settings.html" class="xr-secondary-btn xr-link-btn">Manage preferences</a>
                </div>
            </div>
        `;

        root.querySelector('[data-action="enable-notifications"]')?.addEventListener("click", async () => {
            await requestPermission();
            await deliverLatestNotification();
            renderAll();
        });
    }

    function mountAdminPanel(root) {
        if (state.loading) {
            root.innerHTML = `<section class="xr-admin-gate"><div class="xr-panel xr-admin-gate-panel"><h2>Loading admin panel…</h2></div></section>`;
            return;
        }

        if (!state.adminSession) {
            root.innerHTML = `
                <section class="xr-admin-gate">
                    <div class="xr-panel xr-admin-gate-panel">
                        <p class="xr-eyebrow">Admin access</p>
                        <h2>Unlock the Xonra control room</h2>
                        <p class="xr-muted">
                            Admin publishing now runs server-side, so a single publish can reach every subscribed device.
                        </p>
                        <form class="xr-admin-auth-form">
                            <label for="adminCode">Admin code</label>
                            <input id="adminCode" name="adminCode" type="password" class="xr-input" placeholder="Enter admin code" autocomplete="current-password">
                            <button type="submit" class="xr-primary-btn">Enter dashboard</button>
                            <p class="xr-helper-text">The passcode is verified on the server and is not shown in the interface.</p>
                        </form>
                    </div>
                </section>
            `;

            root.querySelector(".xr-admin-auth-form")?.addEventListener("submit", async (event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                const input = root.querySelector("#adminCode");
                const success = await loginAdmin(formData.get("adminCode"));

                if (success) {
                    await loadAdminFeed();
                    renderAll();
                } else if (input) {
                    input.setCustomValidity("Incorrect admin code");
                    input.reportValidity();
                    setTimeout(() => input.setCustomValidity(""), 1000);
                }
            });
            return;
        }

        const stats = getStats();
        const feed = getFeed().sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));

        root.innerHTML = `
            <section class="xr-admin-shell">
                <div class="xr-admin-header">
                    <div>
                        <p class="xr-eyebrow">Admin panel</p>
                        <h1>Notification and updates control room</h1>
                        <p class="xr-muted">
                            Publishing here writes to the shared server-side feed and sends a push to every subscribed device.
                        </p>
                    </div>
                    <div class="xr-actions-row">
                        <button type="button" class="xr-secondary-btn" data-action="refresh-admin">Refresh</button>
                        <button type="button" class="xr-secondary-btn" data-action="logout-admin">Lock panel</button>
                        <a href="news.html" class="xr-secondary-btn xr-link-btn">View public feed</a>
                    </div>
                </div>

                <div class="xr-stats-grid">
                    <article class="xr-stat-card">
                        <span>Total entries</span>
                        <strong>${stats.total}</strong>
                    </article>
                    <article class="xr-stat-card">
                        <span>Published</span>
                        <strong>${stats.published}</strong>
                    </article>
                    <article class="xr-stat-card">
                        <span>Scheduled</span>
                        <strong>${stats.scheduled}</strong>
                    </article>
                    <article class="xr-stat-card">
                        <span>Drafts</span>
                        <strong>${stats.drafts}</strong>
                    </article>
                    <article class="xr-stat-card">
                        <span>Subscribed devices</span>
                        <strong>${stats.subscribers || 0}</strong>
                    </article>
                </div>

                <div class="xr-admin-grid">
                    <section class="xr-panel">
                        <div class="xr-panel-heading">
                            <div>
                                <p class="xr-eyebrow">Composer</p>
                                <h2>Create an update</h2>
                            </div>
                        </div>
                        <form class="xr-admin-form">
                            <input type="hidden" name="id">
                            <div class="xr-form-grid">
                                <label>
                                    Title
                                    <input class="xr-input" name="title" maxlength="80" required placeholder="Website update shipped">
                                </label>
                                <label>
                                    Target link
                                    <input class="xr-input" name="link" placeholder="news.html#latest">
                                </label>
                            </div>
                            <label>
                                Message
                                <textarea class="xr-input xr-textarea" name="message" maxlength="180" required placeholder="Tell subscribers what changed and why it matters."></textarea>
                            </label>
                            <div class="xr-form-grid">
                                <label>
                                    Channel
                                    <select class="xr-input" name="channel">
                                        ${CHANNELS.map((channel) => `<option value="${channel.id}">${channel.label}</option>`).join("")}
                                    </select>
                                </label>
                                <label>
                                    Priority
                                    <select class="xr-input" name="priority">
                                        <option value="normal">Normal</option>
                                        <option value="high">High</option>
                                    </select>
                                </label>
                            </div>
                            <div class="xr-form-grid">
                                <label>
                                    Status
                                    <select class="xr-input" name="status">
                                        <option value="published">Publish now</option>
                                        <option value="scheduled">Schedule</option>
                                        <option value="draft">Save draft</option>
                                    </select>
                                </label>
                                <label>
                                    Publish at
                                    <input class="xr-input" name="scheduledAt" type="datetime-local">
                                </label>
                            </div>
                            <div class="xr-actions-row">
                                <button type="submit" class="xr-primary-btn">Save update</button>
                                <button type="button" class="xr-secondary-btn" data-action="reset-form">Clear form</button>
                            </div>
                            <p class="xr-helper-text xr-form-feedback" data-form-feedback></p>
                        </form>
                    </section>

                    <section class="xr-panel">
                        <div class="xr-panel-heading">
                            <div>
                                <p class="xr-eyebrow">Feed management</p>
                                <h2>Current entries</h2>
                            </div>
                        </div>
                        <div class="xr-admin-feed">
                            ${feed.length ? feed.map((item) => `
                                <article class="xr-admin-item">
                                    <div class="xr-admin-item-top">
                                        <div>
                                            <span class="xr-pill">${escapeHtml(item.status)}</span>
                                            <span class="xr-pill is-subtle">${escapeHtml(item.channel)}</span>
                                        </div>
                                        <time datetime="${escapeHtml(item.publishedAt || item.scheduledAt || item.createdAt)}">
                                            ${escapeHtml(formatDate(item.publishedAt || item.scheduledAt || item.createdAt, true))}
                                        </time>
                                    </div>
                                    <h3>${escapeHtml(item.title)}</h3>
                                    <p>${escapeHtml(item.message)}</p>
                                    <div class="xr-actions-row">
                                        <button type="button" class="xr-text-btn" data-edit-id="${escapeHtml(item.id)}">Edit</button>
                                        <button type="button" class="xr-text-btn" data-duplicate-id="${escapeHtml(item.id)}">Duplicate</button>
                                        <button type="button" class="xr-text-btn" data-send-id="${escapeHtml(item.id)}">Send now</button>
                                        <button type="button" class="xr-text-btn is-danger" data-delete-id="${escapeHtml(item.id)}">Delete</button>
                                    </div>
                                </article>
                            `).join("") : '<div class="xr-empty-state">No admin updates exist yet. Create your first one from the form.</div>'}
                        </div>
                    </section>
                </div>
            </section>
        `;

        const form = root.querySelector(".xr-admin-form");
        const feedback = root.querySelector("[data-form-feedback]");
        const statusInput = form?.querySelector('[name="status"]');
        const scheduleInput = form?.querySelector('[name="scheduledAt"]');

        function syncScheduleAvailability() {
            if (!statusInput || !scheduleInput) return;
            const scheduled = statusInput.value === "scheduled";
            scheduleInput.disabled = !scheduled;
            if (!scheduled) {
                scheduleInput.value = "";
            }
        }

        syncScheduleAvailability();
        statusInput?.addEventListener("change", syncScheduleAvailability);

        form?.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (feedback) feedback.textContent = "";

            const formData = new FormData(form);
            const payload = {
                id: (formData.get("id") || "").toString().trim(),
                title: (formData.get("title") || "").toString(),
                message: (formData.get("message") || "").toString(),
                link: (formData.get("link") || "").toString() || "news.html",
                channel: (formData.get("channel") || "website").toString(),
                priority: (formData.get("priority") || "normal").toString(),
                status: (formData.get("status") || "published").toString(),
                scheduledAt: (formData.get("scheduledAt") || "").toString()
            };

            if (payload.status === "scheduled" && !payload.scheduledAt) {
                const scheduledField = form.querySelector('[name="scheduledAt"]');
                if (scheduledField) {
                    scheduledField.setCustomValidity("Choose a date and time for scheduled posts");
                    scheduledField.reportValidity();
                    setTimeout(() => scheduledField.setCustomValidity(""), 1000);
                }
                return;
            }

            const response = await publishNotification(payload);
            if (response.ok) {
                form.reset();
                syncScheduleAvailability();
                const deliveredCount = response.data?.delivery?.deliveredCount || 0;
                if (feedback) {
                    feedback.textContent = payload.status === "published"
                        ? `Published successfully. Push fan-out reached ${deliveredCount} subscribed device${deliveredCount === 1 ? "" : "s"}.`
                        : "Saved successfully.";
                }
                renderAll();
            } else if (feedback) {
                feedback.textContent = response.data?.error || "Could not save this update.";
            }
        });

        root.querySelector('[data-action="reset-form"]')?.addEventListener("click", () => {
            form?.reset();
            if (feedback) feedback.textContent = "";
            syncScheduleAvailability();
        });

        root.querySelector('[data-action="refresh-admin"]')?.addEventListener("click", async () => {
            await loadAdminFeed();
            renderAll();
        });

        root.querySelector('[data-action="logout-admin"]')?.addEventListener("click", () => {
            sessionStorage.removeItem(ADMIN_HASH_KEY);
            state.adminSession = false;
            renderAll();
        });

        root.querySelectorAll("[data-edit-id]").forEach((button) => {
            button.addEventListener("click", () => {
                const item = getFeed().find((entry) => entry.id === button.dataset.editId);
                if (!item || !form) return;

                form.querySelector('[name="id"]').value = item.id;
                form.querySelector('[name="title"]').value = item.title;
                form.querySelector('[name="message"]').value = item.message;
                form.querySelector('[name="link"]').value = item.link;
                form.querySelector('[name="channel"]').value = item.channel;
                form.querySelector('[name="priority"]').value = item.priority;
                form.querySelector('[name="status"]').value = item.status;
                form.querySelector('[name="scheduledAt"]').value = item.scheduledAt ? item.scheduledAt.slice(0, 16) : "";
                syncScheduleAvailability();
                form.scrollIntoView({ behavior: "smooth", block: "start" });
            });
        });

        root.querySelectorAll("[data-duplicate-id]").forEach((button) => {
            button.addEventListener("click", () => {
                const item = getFeed().find((entry) => entry.id === button.dataset.duplicateId);
                if (!item || !form) return;

                form.querySelector('[name="id"]').value = "";
                form.querySelector('[name="title"]').value = item.title;
                form.querySelector('[name="message"]').value = item.message;
                form.querySelector('[name="link"]').value = item.link;
                form.querySelector('[name="channel"]').value = item.channel;
                form.querySelector('[name="priority"]').value = item.priority;
                form.querySelector('[name="status"]').value = "draft";
                form.querySelector('[name="scheduledAt"]').value = "";
                syncScheduleAvailability();
                form.scrollIntoView({ behavior: "smooth", block: "start" });
            });
        });

        root.querySelectorAll("[data-delete-id]").forEach((button) => {
            button.addEventListener("click", async () => {
                await deleteNotification(button.dataset.deleteId);
                renderAll();
            });
        });

        root.querySelectorAll("[data-send-id]").forEach((button) => {
            button.addEventListener("click", async () => {
                const item = getFeed().find((entry) => entry.id === button.dataset.sendId);
                if (!item || !feedback) return;

                const response = await publishNotification({
                    ...item,
                    status: "published",
                    scheduledAt: ""
                });

                if (response.ok) {
                    feedback.textContent = `Notification sent to ${response.data?.delivery?.deliveredCount || 0} subscribed device${(response.data?.delivery?.deliveredCount || 0) === 1 ? "" : "s"}.`;
                    renderAll();
                } else {
                    feedback.textContent = response.data?.error || "Could not send this notification.";
                }
            });
        });
    }

    function renderAll() {
        document.querySelectorAll("[data-notification-settings]").forEach(mountSettingsPanel);
        document.querySelectorAll("[data-news-notifications]").forEach(mountNewsPanel);
        document.querySelectorAll("[data-notification-cta]").forEach(mountHeroCta);
        document.querySelectorAll("[data-admin-app]").forEach(mountAdminPanel);
        document.querySelectorAll("[data-notification-count]").forEach((node) => {
            node.textContent = getUnreadCount();
        });
    }

    function attachGlobalListeners() {
        window.addEventListener("storage", async (event) => {
            if ([LOCAL_FEED_KEY, PREFS_KEY].includes(event.key)) {
                await refreshFeed();
                renderAll();
            }
        });
    }

    async function detectBackend() {
        const [feedResponse, pushResponse] = await Promise.all([
            requestJson("/api/notifications/feed"),
            requestJson("/api/push/public-key")
        ]);

        state.apiAvailable = feedResponse.ok;
        if (feedResponse.ok && Array.isArray(feedResponse.data.feed)) {
            state.feed = feedResponse.data.feed.map(normalizeItem);
            state.stats = feedResponse.data.stats || null;
        } else {
            state.feed = getLocalFeed();
            state.stats = null;
        }

        state.pushConfigured = Boolean(pushResponse.ok && pushResponse.data.supported && pushResponse.data.publicKey);
        state.publicKey = pushResponse.ok ? pushResponse.data.publicKey : null;
    }

    async function init() {
        seedLocalFeedIfEmpty();
        await registerServiceWorker();
        await detectBackend();
        await verifyAdminSession();

        if (matchesPermission() && Notification.permission === "granted") {
            await subscribeCurrentDevice(getPrefs().topics);
        }

        state.loading = false;
        renderAll();
        attachGlobalListeners();

        window.setInterval(async () => {
            await refreshFeed();
            renderAll();
        }, 45000);
    }

    window.XonraNotifications = {
        CHANNELS,
        getFeed,
        getPublishedNotifications,
        getPrefs,
        savePrefs,
        publishNotification,
        deleteNotification,
        showBrowserNotification,
        requestPermission,
        refreshFeed
    };

    document.addEventListener("DOMContentLoaded", init);
})();
