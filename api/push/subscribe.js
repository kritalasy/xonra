const { readJsonBody } = require("../_lib/request");
const { upsertSubscription } = require("../_lib/store");
const { isPushConfigured } = require("../_lib/push");

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }

    if (!isPushConfigured()) {
        res.status(503).json({ error: "Push notifications are not configured on the server" });
        return;
    }

    const body = await readJsonBody(req);
    const subscription = body.subscription;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
        res.status(400).json({ error: "A valid push subscription is required" });
        return;
    }

    const saved = await upsertSubscription({
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        topics: body.topics,
        userAgent: body.userAgent
    });

    res.status(200).json({
        ok: true,
        subscription: saved
    });
};
