const { createPrivateKey, sign } = require("crypto");

function bufferToBase64Url(buffer) {
    return Buffer.from(buffer)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

function base64UrlToBuffer(value) {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4 || 4)) % 4);
    return Buffer.from(padded, "base64");
}

function getPushConfig() {
    return {
        publicKey: process.env.WEB_PUSH_PUBLIC_KEY || "",
        privateKey: process.env.WEB_PUSH_PRIVATE_KEY || "",
        subject: process.env.WEB_PUSH_SUBJECT || "mailto:admin@xonra.example"
    };
}

function isPushConfigured() {
    const config = getPushConfig();
    return Boolean(config.publicKey && config.privateKey);
}

function createVapidPrivateKeyObject() {
    const { publicKey, privateKey } = getPushConfig();
    const publicBuffer = base64UrlToBuffer(publicKey);

    if (publicBuffer.length !== 65) {
        throw new Error("WEB_PUSH_PUBLIC_KEY must be an uncompressed P-256 public key");
    }

    const jwk = {
        kty: "EC",
        crv: "P-256",
        x: bufferToBase64Url(publicBuffer.subarray(1, 33)),
        y: bufferToBase64Url(publicBuffer.subarray(33, 65)),
        d: privateKey
    };

    return createPrivateKey({ key: jwk, format: "jwk" });
}

function createVapidJwt(audience) {
    const { publicKey, subject } = getPushConfig();
    const header = bufferToBase64Url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
    const payload = bufferToBase64Url(Buffer.from(JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: subject
    })));
    const unsigned = `${header}.${payload}`;
    const signature = sign("SHA256", Buffer.from(unsigned), {
        key: createVapidPrivateKeyObject(),
        dsaEncoding: "ieee-p1363"
    });

    return {
        token: `${unsigned}.${bufferToBase64Url(signature)}`,
        publicKey
    };
}

async function sendPush(subscription) {
    const endpoint = subscription?.endpoint;
    if (!endpoint || !isPushConfigured()) {
        return { ok: false, status: 0, endpoint };
    }

    const audience = new URL(endpoint).origin;
    const vapid = createVapidJwt(audience);

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            TTL: "60",
            Urgency: "high",
            Authorization: `vapid t=${vapid.token}, k=${vapid.publicKey}`,
            "Crypto-Key": `p256ecdsa=${vapid.publicKey}`
        },
        body: ""
    });

    return {
        ok: response.ok,
        status: response.status,
        endpoint
    };
}

async function broadcastNotification(subscriptions, notification = {}) {
    const eligibleSubscriptions = subscriptions.filter((subscription) => {
        if (!notification.channel) {
            return true;
        }

        return Array.isArray(subscription.topics) ? subscription.topics.includes(notification.channel) : true;
    });

    const results = await Promise.all(eligibleSubscriptions.map((subscription) => sendPush(subscription)));
    const invalidEndpoints = results
        .filter((result) => result.status === 404 || result.status === 410)
        .map((result) => result.endpoint);

    return {
        deliveredCount: results.filter((result) => result.ok).length,
        invalidEndpoints,
        results
    };
}

module.exports = {
    getPushConfig,
    isPushConfigured,
    broadcastNotification
};
