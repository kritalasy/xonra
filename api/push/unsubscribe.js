const { readJsonBody } = require("../_lib/request");
const { removeSubscription } = require("../_lib/store");

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }

    const body = await readJsonBody(req);
    const endpoint = body.endpoint || body.subscription?.endpoint;

    if (!endpoint) {
        res.status(400).json({ error: "Subscription endpoint is required" });
        return;
    }

    const subscriptions = await removeSubscription(endpoint);
    res.status(200).json({
        ok: true,
        subscriptions
    });
};
