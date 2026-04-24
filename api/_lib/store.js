const FEED_KEY = "xonra:notifications:feed";
const SUBSCRIPTIONS_KEY = "xonra:push:subscriptions";
const MAX_ITEMS = 60;

const DEFAULT_FEED = [
    {
        id: "seed-website-refresh",
        title: "Xonra website refresh is live",
        message: "The site now has a cleaner layout, a news hub, and more room for team updates.",
        link: "news.html",
        channel: "website",
        priority: "high",
        status: "published",
        publishedAt: "2026-04-18T10:00:00.000Z",
        scheduledAt: "",
        createdAt: "2026-04-18T10:00:00.000Z"
    },
    {
        id: "seed-community-roadmap",
        title: "Community feedback now shapes the roadmap",
        message: "Discord feedback is helping the team decide what to improve first and what to build next.",
        link: "news.html",
        channel: "community",
        priority: "normal",
        status: "published",
        publishedAt: "2026-04-19T12:00:00.000Z",
        scheduledAt: "",
        createdAt: "2026-04-19T12:00:00.000Z"
    }
];

function getMemoryStore() {
    if (!globalThis.__xonraMemoryStore) {
        globalThis.__xonraMemoryStore = new Map();
    }

    return globalThis.__xonraMemoryStore;
}

function hasKvConfig() {
    return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function runKvCommand(command) {
    if (!hasKvConfig()) {
        const memory = getMemoryStore();
        const [verb, key, value] = command;

        if (verb === "GET") {
            return memory.has(key) ? memory.get(key) : null;
        }

        if (verb === "SET") {
            memory.set(key, value);
            return "OK";
        }

        throw new Error(`Unsupported in-memory KV verb: ${verb}`);
    }

    const response = await fetch(process.env.KV_REST_API_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(command)
    });

    const payload = await response.json();
    if (!response.ok) {
        throw new Error(payload.error || "KV command failed");
    }

    return payload.result;
}

async function readJson(key, fallback) {
    const value = await runKvCommand(["GET", key]);
    if (!value) {
        return fallback;
    }

    if (typeof value === "string") {
        try {
            return JSON.parse(value);
        } catch (error) {
            return fallback;
        }
    }

    return value;
}

async function writeJson(key, value) {
    await runKvCommand(["SET", key, JSON.stringify(value)]);
    return value;
}

function normalizeNotification(item) {
    return {
        id: item.id || `note-${Date.now()}`,
        title: item.title || "Untitled update",
        message: item.message || "",
        link: item.link || "news.html",
        channel: item.channel || "website",
        priority: item.priority || "normal",
        status: item.status || "published",
        publishedAt: item.publishedAt || "",
        scheduledAt: item.scheduledAt || "",
        createdAt: item.createdAt || new Date().toISOString()
    };
}

function normalizeSubscription(item) {
    return {
        endpoint: item.endpoint,
        keys: item.keys || {},
        topics: Array.isArray(item.topics) && item.topics.length ? item.topics : ["website", "games", "community", "events"],
        userAgent: item.userAgent || "",
        createdAt: item.createdAt || new Date().toISOString()
    };
}

async function getAllNotifications() {
    const feed = await readJson(FEED_KEY, DEFAULT_FEED);
    const normalized = feed.map(normalizeNotification).slice(0, MAX_ITEMS);

    if (!feed.length) {
        await writeJson(FEED_KEY, normalized);
    }

    return normalized;
}

async function saveAllNotifications(items) {
    const normalized = items.map(normalizeNotification).slice(0, MAX_ITEMS);
    await writeJson(FEED_KEY, normalized);
    return normalized;
}

async function getSubscriptions() {
    const subscriptions = await readJson(SUBSCRIPTIONS_KEY, []);
    return subscriptions
        .filter((item) => item && item.endpoint)
        .map(normalizeSubscription);
}

async function saveSubscriptions(items) {
    const normalized = items
        .filter((item) => item && item.endpoint)
        .map(normalizeSubscription);

    await writeJson(SUBSCRIPTIONS_KEY, normalized);
    return normalized;
}

async function upsertSubscription(subscription) {
    const current = await getSubscriptions();
    const normalized = normalizeSubscription(subscription);
    const next = current.filter((item) => item.endpoint !== normalized.endpoint);
    next.unshift(normalized);
    await saveSubscriptions(next);
    return normalized;
}

async function removeSubscription(endpoint) {
    const current = await getSubscriptions();
    const next = current.filter((item) => item.endpoint !== endpoint);
    await saveSubscriptions(next);
    return next;
}

async function flushScheduledNotifications({ onPublish } = {}) {
    const now = Date.now();
    const feed = await getAllNotifications();
    let changed = false;
    const justPublished = [];

    const nextFeed = feed.map((item) => {
        if (item.status === "scheduled" && item.scheduledAt) {
            const scheduledAt = new Date(item.scheduledAt).getTime();
            if (!Number.isNaN(scheduledAt) && scheduledAt <= now) {
                changed = true;
                const published = {
                    ...item,
                    status: "published",
                    publishedAt: new Date().toISOString()
                };
                justPublished.push(published);
                return published;
            }
        }

        return item;
    });

    if (changed) {
        await saveAllNotifications(nextFeed);
        if (typeof onPublish === "function") {
            for (const item of justPublished) {
                await onPublish(item);
            }
        }
    }

    return nextFeed;
}

async function getPublishedNotifications() {
    const feed = await flushScheduledNotifications();
    return feed
        .filter((item) => item.status === "published")
        .sort((left, right) => new Date(right.publishedAt) - new Date(left.publishedAt));
}

function createStats(feed, subscriptions) {
    return {
        total: feed.length,
        published: feed.filter((item) => item.status === "published").length,
        scheduled: feed.filter((item) => item.status === "scheduled").length,
        drafts: feed.filter((item) => item.status === "draft").length,
        subscribers: subscriptions.length
    };
}

module.exports = {
    MAX_ITEMS,
    hasKvConfig,
    normalizeNotification,
    getAllNotifications,
    saveAllNotifications,
    getPublishedNotifications,
    getSubscriptions,
    saveSubscriptions,
    upsertSubscription,
    removeSubscription,
    flushScheduledNotifications,
    createStats
};
