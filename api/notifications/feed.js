const { getAllNotifications, getSubscriptions, createStats, flushScheduledNotifications } = require("../_lib/store");

module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }

    const feed = await flushScheduledNotifications();
    const subscriptions = await getSubscriptions();

    res.status(200).json({
        feed,
        stats: createStats(feed, subscriptions)
    });
};
