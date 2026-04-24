(() => {
    const FEED_KEY = "xonra-notification-feed";
    const PREFS_KEY = "xonra-notification-prefs";
    const ADMIN_SESSION_KEY = "xonra-admin-session";
    const ADMIN_CODE_HASH = "fe88422601fcc6f3908c3488a60d63b8a8d8b06bdae3251a9bd4578a9c6cb92a";
    const MAX_ITEMS = 60;
    const CHANNELS = [
        { id: "website", label: "Website updates" },
        { id: "games", label: "Game news" },
        { id: "community", label: "Community posts" },
        { id: "events", label: "Events and launches" }
    ];

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

    async function sha256(value) {
        const source = new TextEncoder().encode(value);
        const digest = await crypto.subtle.digest("SHA-256", source);
        return Array.from(new Uint8Array(digest))
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
    }

    async function isValidAdminCode(value) {
        const normalized = String(value || "").trim();
        if (!normalized || !window.crypto?.subtle) {
            return false;
        }

        return (await sha256(normalized)) === ADMIN_CODE_HASH;
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

    function getFeed() {
        const stored = readStorage(FEED_KEY, []);
        return stored.map(normalizeItem).slice(0, MAX_ITEMS);
    }

    function saveFeed(items) {
        writeStorage(FEED_KEY, items.map(normalizeItem).slice(0, MAX_ITEMS));
    }

    function seedFeedIfEmpty() {
        const existing = getFeed();
        if (existing.length) return existing;

        const seeded = [
            {
                id: uid("seed"),
                title: "Xonra website refresh is live",
                message: "The site now has a cleaner layout, a news hub, and more room for team updates.",
                link: "news.html",
                channel: "website",
                priority: "high",
                status: "published",
                publishedAt: "2026-04-18T10:00:00.000Z",
                createdAt: "2026-04-18T10:00:00.000Z"
            },
            {
                id: uid("seed"),
                title: "Community feedback now shapes the roadmap",
                message: "Discord feedback is helping the team decide what to improve first and what to build next.",
                link: "news.html",
                channel: "community",
                priority: "normal",
                status: "published",
                publishedAt: "2026-04-19T12:00:00.000Z",
                createdAt: "2026-04-19T12:00:00.000Z"
            }
        ];

        saveFeed(seeded);
        return getFeed();
    }

    function flushScheduledNotifications() {
        const now = Date.now();
        let changed = false;
        const nextFeed = getFeed().map((item) => {
            if (item.status === "scheduled" && item.scheduledAt) {
                const scheduledAt = new Date(item.scheduledAt).getTime();
                if (!Number.isNaN(scheduledAt) && scheduledAt <= now) {
                    changed = true;
                    return {
                        ...item,
                        status: "published",
                        publishedAt: new Date().toISOString()
                    };
                }
            }
            return item;
        });

        if (changed) {
            saveFeed(nextFeed);
        }

        return nextFeed;
    }

    function getPublishedNotifications() {
        return flushScheduledNotifications()
            .filter((item) => item.status === "published")
            .sort((left, right) => new Date(right.publishedAt) - new Date(left.publishedAt));
    }

    function getUnreadCount() {
        const prefs = getPrefs();
        const notifications = getVisibleNotifications();
        if (!notifications.length) return 0;
        if (!prefs.lastSeenId) return notifications.length;

        const lastSeenIndex = notifications.findIndex((item) => item.id === prefs.lastSeenId);
        return lastSeenIndex === -1 ? notifications.length : lastSeenIndex;
    }

    function getVisibleNotifications() {
        const prefs = getPrefs();
        return getPublishedNotifications().filter((item) => prefs.topics.includes(item.channel));
    }

    function markAllSeen() {
        const latest = getVisibleNotifications()[0];
        if (!latest) return;
        savePrefs({ lastSeenId: latest.id });
    }

    function matchesPermission() {
        return typeof window !== "undefined" && "Notification" in window;
    }

    async function registerServiceWorker() {
        if (!("serviceWorker" in navigator)) return null;
        try {
            return await navigator.serviceWorker.register("./sw.js");
        } catch (error) {
            return null;
        }
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

    function publishNotification(values) {
        const base = {
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
        };

        const feed = getFeed();
        const existingIndex = feed.findIndex((item) => item.id === base.id);
        if (existingIndex >= 0) {
            feed[existingIndex] = normalizeItem({ ...feed[existingIndex], ...base });
        } else {
            feed.unshift(normalizeItem(base));
        }

        saveFeed(feed);
        return normalizeItem(base);
    }

    function deleteNotification(id) {
        saveFeed(getFeed().filter((item) => item.id !== id));
    }

    function duplicateNotification(id) {
        const target = getFeed().find((item) => item.id === id);
        if (!target) return null;

        return publishNotification({
            ...target,
            id: uid("note"),
            status: "draft",
            scheduledAt: "",
            publishedAt: "",
            createdAt: new Date().toISOString()
        });
    }

    function getAdminState() {
        return sessionStorage.getItem(ADMIN_SESSION_KEY) === "true";
    }

    function setAdminState(value) {
        sessionStorage.setItem(ADMIN_SESSION_KEY, value ? "true" : "false");
    }

    function getStats() {
        const feed = getFeed();
        const published = feed.filter((item) => item.status === "published").length;
        const scheduled = feed.filter((item) => item.status === "scheduled").length;
        const drafts = feed.filter((item) => item.status === "draft").length;
        const prefs = getPrefs();

        return {
            total: feed.length,
            published,
            scheduled,
            drafts,
            browserEnabled: prefs.browserEnabled,
            unread: getUnreadCount()
        };
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

        root.innerHTML = `
            <div class="xr-card-grid">
                <section class="xr-panel">
                    <div class="xr-panel-heading">
                        <div>
                            <p class="xr-eyebrow">Notification hub</p>
                            <h3>Stay in the loop</h3>
                        </div>
                        <span class="xr-status-badge ${prefs.browserEnabled ? "is-live" : ""}">
                            ${prefs.browserEnabled ? "Enabled" : "Disabled"}
                        </span>
                    </div>
                    <p class="xr-muted">
                        Enable browser notifications for launches, website updates, and team announcements.
                    </p>
                    <div class="xr-actions-row">
                        <button type="button" class="xr-primary-btn" data-action="enable-notifications">
                            ${permission === "granted" ? "Refresh access" : "Enable browser notifications"}
                        </button>
                        <button type="button" class="xr-secondary-btn" data-action="test-notification">Send test alert</button>
                    </div>
                    <p class="xr-helper-text">
                        Browser support: <strong>${escapeHtml(permission)}</strong>
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
            }
            renderAll();
        });

        root.querySelector('[data-action="test-notification"]')?.addEventListener("click", async () => {
            const item = {
                id: uid("preview"),
                title: "Test notification from Xonra",
                message: "Your browser is ready to receive new updates from the site.",
                link: "settings.html",
                priority: "normal"
            };
            await showBrowserNotification(item, true);
        });

        root.querySelector('[data-action="mark-all-seen"]')?.addEventListener("click", () => {
            markAllSeen();
            renderAll();
        });

        root.querySelector(".xr-topics-form")?.addEventListener("submit", (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const topics = formData.getAll("topic");
            savePrefs({
                topics: topics.length ? topics : CHANNELS.map((channel) => channel.id),
                muted: formData.get("muted") === "on"
            });
            renderAll();
        });
    }

    function mountNewsPanel(root) {
        const items = getVisibleNotifications().slice(0, 3);
        const unread = getUnreadCount();

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
                    These cards update from the shared notification system and mirror what subscribers see first.
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

        root.innerHTML = `
            <div class="xr-banner">
                <div>
                    <p class="xr-eyebrow">New system</p>
                    <h3>Turn on Xonra notifications</h3>
                    <p class="xr-muted">
                        ${latest ? escapeHtml(latest.title) : "Get the next launch and community post as soon as it drops."}
                    </p>
                </div>
                <div class="xr-actions-row">
                    <button type="button" class="xr-primary-btn" data-action="enable-notifications">
                        ${prefs.browserEnabled ? "Notifications enabled" : "Enable alerts"}
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
        if (!getAdminState()) {
            root.innerHTML = `
                <section class="xr-admin-gate">
                    <div class="xr-panel xr-admin-gate-panel">
                        <p class="xr-eyebrow">Admin access</p>
                        <h2>Unlock the Xonra control room</h2>
                        <p class="xr-muted">
                            This front-end admin panel uses a simple passcode gate for local control.
                        </p>
                        <form class="xr-admin-auth-form">
                            <label for="adminCode">Admin code</label>
                            <input id="adminCode" name="adminCode" type="password" class="xr-input" placeholder="Enter admin code" autocomplete="current-password">
                            <button type="submit" class="xr-primary-btn">Enter dashboard</button>
                            <p class="xr-helper-text">The passcode is no longer shown in the interface.</p>
                        </form>
                    </div>
                </section>
            `;

            root.querySelector(".xr-admin-auth-form")?.addEventListener("submit", async (event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                if (await isValidAdminCode(formData.get("adminCode"))) {
                    setAdminState(true);
                    renderAll();
                } else {
                    const input = root.querySelector("#adminCode");
                    if (input) {
                        input.setCustomValidity("Incorrect admin code");
                        input.reportValidity();
                        setTimeout(() => input.setCustomValidity(""), 1000);
                    }
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
                            Publish new announcements, schedule future drops, and keep the public feed in sync.
                        </p>
                    </div>
                    <div class="xr-actions-row">
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
                                        <button type="button" class="xr-text-btn" data-send-id="${escapeHtml(item.id)}">Notify now</button>
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

            const created = publishNotification(payload);
            if (created.status === "published") {
                await showBrowserNotification(created, true);
            }

            form.reset();
            syncScheduleAvailability();
            renderAll();
        });

        root.querySelector('[data-action="reset-form"]')?.addEventListener("click", () => {
            form?.reset();
            syncScheduleAvailability();
        });

        root.querySelector('[data-action="logout-admin"]')?.addEventListener("click", () => {
            setAdminState(false);
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
                duplicateNotification(button.dataset.duplicateId);
                renderAll();
            });
        });

        root.querySelectorAll("[data-delete-id]").forEach((button) => {
            button.addEventListener("click", () => {
                deleteNotification(button.dataset.deleteId);
                renderAll();
            });
        });

        root.querySelectorAll("[data-send-id]").forEach((button) => {
            button.addEventListener("click", async () => {
                const item = getFeed().find((entry) => entry.id === button.dataset.sendId);
                if (!item) return;
                await showBrowserNotification({ ...item, status: "published" }, true);
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
        window.addEventListener("storage", (event) => {
            if ([FEED_KEY, PREFS_KEY].includes(event.key)) {
                renderAll();
            }
        });
    }

    async function init() {
        seedFeedIfEmpty();
        flushScheduledNotifications();
        await registerServiceWorker();
        renderAll();
        attachGlobalListeners();

        window.setInterval(async () => {
            const before = getPublishedNotifications()[0]?.id;
            flushScheduledNotifications();
            const after = getPublishedNotifications()[0]?.id;
            if (after && after !== before) {
                await deliverLatestNotification();
            }
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
        duplicateNotification,
        showBrowserNotification,
        requestPermission
    };

    document.addEventListener("DOMContentLoaded", init);
})();
