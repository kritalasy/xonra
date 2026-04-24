const { getPushConfig, isPushConfigured } = require("../_lib/push");

module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }

    const config = getPushConfig();
    res.status(200).json({
        supported: isPushConfigured(),
        publicKey: config.publicKey || null
    });
};
