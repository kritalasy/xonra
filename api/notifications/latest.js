const { getPublishedNotifications } = require("../_lib/store");

module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }

    const notifications = await getPublishedNotifications();
    res.status(200).json({
        notification: notifications[0] || null
    });
};
