const { timingSafeEqual } = require("crypto");

const DEFAULT_ADMIN_HASH = "fe88422601fcc6f3908c3488a60d63b8a8d8b06bdae3251a9bd4578a9c6cb92a";

function getExpectedAdminHash() {
    return process.env.XONRA_ADMIN_CODE_HASH || DEFAULT_ADMIN_HASH;
}

function verifyAdminHash(candidate) {
    const provided = Buffer.from(String(candidate || ""), "utf8");
    const expected = Buffer.from(getExpectedAdminHash(), "utf8");

    if (provided.length !== expected.length) {
        return false;
    }

    return timingSafeEqual(provided, expected);
}

function getAdminHashFromRequest(req, body = {}) {
    return req.headers["x-admin-hash"] || body.adminHash || "";
}

module.exports = {
    verifyAdminHash,
    getAdminHashFromRequest
};
