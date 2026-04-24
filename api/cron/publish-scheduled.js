const { flushScheduledNotifications, getSubscriptions, saveSubscriptions } = require("../_lib/store");
const { broadcastNotification, isPushConfigured } = require("../_lib/push");

module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }

    const subscriptions = await getSubscriptions();
    const publishedIds = [];

    const feed = await flushScheduledNotifications({
        onPublish: async (item) => {
            publishedIds.push(item.id);
            if (!isPushConfigured() || !subscriptions.length) {
                return;
            }

            const delivery = await broadcastNotification(subscriptions, item);
            if (delivery.invalidEndpoints.length) {
                const active = subscriptions.filter((subscription) => !delivery.invalidEndpoints.includes(subscription.endpoint));
                subscriptions.splice(0, subscriptions.length, ...active);
                await saveSubscriptions(active);
            }
        }
    });

    res.status(200).json({
        ok: true,
        publishedIds,
        total: feed.length
    });
};
