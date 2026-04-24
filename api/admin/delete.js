const { readJsonBody } = require("../_lib/request");
const { verifyAdminHash, getAdminHashFromRequest } = require("../_lib/auth");
const { getAllNotifications, saveAllNotifications, getSubscriptions, createStats } = require("../_lib/store");

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

    if (!body.id) {
        res.status(400).json({ error: "Notification id is required" });
        return;
    }

    const feed = await getAllNotifications();
    const nextFeed = await saveAllNotifications(feed.filter((item) => item.id !== body.id));
    const subscriptions = await getSubscriptions();

    res.status(200).json({
        ok: true,
        stats: createStats(nextFeed, subscriptions)
    });
};
