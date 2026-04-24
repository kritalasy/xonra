const { readJsonBody } = require("../_lib/request");
const { verifyAdminHash, getAdminHashFromRequest } = require("../_lib/auth");

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

    res.status(200).json({ ok: true });
};
