const { readJsonBody } = require("../_lib/request");
const { verifyAdminHash, getAdminHashFromRequest } = require("../_lib/auth");
const { getAllNotifications, getSubscriptions, createStats, flushScheduledNotifications } = require("../_lib/store");

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

    const feed = await flushScheduledNotifications();
    const subscriptions = await getSubscriptions();

    res.status(200).json({
        feed,
        stats: createStats(feed, subscriptions)
    });
};
