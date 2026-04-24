const { readJsonBody } = require("../_lib/request");
const { verifyAdminHash, getAdminHashFromRequest } = require("../_lib/auth");
const {
    normalizeNotification,
    getAllNotifications,
    saveAllNotifications,
    getSubscriptions,
    saveSubscriptions,
    createStats
} = require("../_lib/store");
const { broadcastNotification, isPushConfigured } = require("../_lib/push");

function createId() {
    return `note-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }

    const body = await readJsonBody(req);
    const adminHash = getAdminHashFromRequest(req, body);

    if (!verifyAdminHash(adminHash)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    const values = body.notification || {};
    if (!values.title || !values.message) {
        res.status(400).json({ error: "Title and message are required" });
        return;
    }

    const item = normalizeNotification({
        id: values.id || createId(),
        title: String(values.title).trim(),
        message: String(values.message).trim(),
        link: String(values.link || "news.html").trim() || "news.html",
        channel: values.channel || "website",
        priority: values.priority || "normal",
        status: values.status || "published",
        scheduledAt: values.status === "scheduled" ? values.scheduledAt : "",
        publishedAt: values.status === "published" ? new Date().toISOString() : "",
        createdAt: values.createdAt || new Date().toISOString()
    });

    const feed = await getAllNotifications();
    const existingIndex = feed.findIndex((entry) => entry.id === item.id);
    if (existingIndex >= 0) {
        feed[existingIndex] = item;
    } else {
        feed.unshift(item);
    }

    const nextFeed = await saveAllNotifications(feed);
    const subscriptions = await getSubscriptions();

    let delivery = { deliveredCount: 0, invalidEndpoints: [] };
    if (item.status === "published" && isPushConfigured() && subscriptions.length) {
        delivery = await broadcastNotification(subscriptions, item);
        if (delivery.invalidEndpoints.length) {
            const activeSubscriptions = subscriptions.filter((subscription) => !delivery.invalidEndpoints.includes(subscription.endpoint));
            await saveSubscriptions(activeSubscriptions);
        }
    }

    res.status(200).json({
        ok: true,
        notification: item,
        stats: createStats(nextFeed, await getSubscriptions()),
        delivery
    });
};
