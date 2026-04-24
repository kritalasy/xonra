async function readJsonBody(req) {
    if (req.body && typeof req.body === "object") {
        return req.body;
    }

    const chunks = [];
    for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }

    if (!chunks.length) {
        return {};
    }

    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (error) {
        return {};
    }
}

module.exports = {
    readJsonBody
};
