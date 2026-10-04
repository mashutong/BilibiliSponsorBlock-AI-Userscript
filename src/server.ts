import { getSetting, request, setSetting } from "./bridge";
import { hasRawSegmentsForCid, SponsorRange } from "./core";

const servers = ["https://www.bsbsb.top", "https://www.bsbsb.xyz"];

export interface SegmentLookup {
    hasRawSegments: boolean;
    server: string;
}

async function hashPrefix(bvid: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bvid));
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 4);
}

export async function lookupSegments(bvid: string, cid: string, fresh = false): Promise<SegmentLookup> {
    const prefix = await hashPrefix(bvid);
    for (const server of servers) {
        try {
            const response = await request({
                url: `${server}/api/skipSegments/${prefix}`,
                anonymous: true,
                timeout: 8000,
                headers: fresh ? { "X-SKIP-CACHE": "1", "Cache-Control": "no-cache" } : {},
            });
            if (response.status === 404) return { hasRawSegments: false, server };
            if (response.status !== 200) continue;
            return {
                hasRawSegments: hasRawSegmentsForCid(JSON.parse(response.responseText ?? ""), bvid, cid),
                server,
            };
        } catch (_) {
            // Try the original project's mirror, but never infer absence from an error.
        }
    }
    throw new Error("SponsorBlock server lookup unavailable");
}

function getUserId(): string {
    const saved = getSetting("userID");
    if (saved) return saved;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const random = crypto.getRandomValues(new Uint32Array(36));
    const id = Array.from(random, (value) => chars[value % chars.length]).join("");
    setSetting("userID", id);
    return id;
}

export async function submitSegments(
    server: string,
    bvid: string,
    cid: string,
    duration: number,
    ranges: SponsorRange[]
): Promise<boolean> {
    const segments = ranges.map(({ start, end }) => ({
        segment: [start, end],
        category: "sponsor",
        actionType: "skip",
    }));
    const response = await request({
        method: "POST",
        url: `${server}/api/skipSegments`,
        anonymous: true,
        redirect: "error",
        timeout: 15000,
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({
            videoID: bvid,
            cid,
            userID: getUserId(),
            segments,
            videoDuration: duration,
            userAgent: "Tampermonkey-BSB-AI/0.1.0",
        }),
    });
    if (response.status !== 200) return false;
    try {
        const accepted = JSON.parse(response.responseText ?? "");
        return Array.isArray(accepted) && accepted.length === segments.length &&
            accepted.every((segment) => typeof segment.UUID === "string");
    } catch (_) {
        return false;
    }
}
