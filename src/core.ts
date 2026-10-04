export interface SubtitleCue {
    from: number;
    to: number;
    content: string;
}

export interface SponsorRange {
    start: number;
    end: number;
}

export interface VideoAddress {
    bvid: string;
    page: number;
}

export const minimumAiVideoDuration = 5 * 60;

export function parseVideoAddress(rawUrl: string): VideoAddress | null {
    const url = new URL(rawUrl);
    if (url.hostname !== "www.bilibili.com") return null;
    const match = url.pathname.match(/^\/video\/(BV[0-9A-Za-z]{10})(?:\/|$)/);
    const bvid = match?.[1] ?? (url.pathname.startsWith("/list/") ? url.searchParams.get("bvid") : null);
    if (!bvid || !/^BV[0-9A-Za-z]{10}$/.test(bvid)) return null;
    const page = Number(url.searchParams.get("p") ?? 1);
    return { bvid, page: Number.isSafeInteger(page) && page > 0 ? page : 1 };
}

export function hasRawSegmentsForCid(payload: unknown, bvid: string, cid: string): boolean {
    if (!Array.isArray(payload)) throw new Error("Invalid segment response");
    for (const record of payload) {
        if (!record || typeof record !== "object" || record.videoID !== bvid) continue;
        if (!Array.isArray(record.segments)) throw new Error("Invalid video segment record");
        if (record.segments.some((segment: { cid?: unknown }) => String(segment?.cid) === cid)) return true;
    }
    return false;
}

export function splitCues(cues: SubtitleCue[], maxCharacters = 12000): SubtitleCue[][] {
    const chunks: SubtitleCue[][] = [];
    let start = 0;
    while (start < cues.length) {
        let end = start;
        let length = 0;
        while (end < cues.length) {
            const cueLength = cues[end].content.length + 32;
            if (end > start && length + cueLength > maxCharacters) break;
            length += cueLength;
            end++;
        }
        chunks.push(cues.slice(start, end));
        if (end === cues.length) break;
        start = Math.max(start + 1, end - 2);
    }
    return chunks;
}

export function normalizeRanges(
    ranges: unknown[],
    duration: number,
    chunkStart: number,
    chunkEnd: number,
    cues: SubtitleCue[]
): SponsorRange[] {
    const valid: SponsorRange[] = [];
    for (const raw of ranges) {
        if (!raw || typeof raw !== "object") continue;
        const candidate = raw as Record<string, unknown>;
        const start = candidate.start;
        const end = candidate.end;
        if (typeof start !== "number" || typeof end !== "number") continue;
        if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
        if (start < 0 || end > duration || end - start < 1 || end - start > 300) continue;
        if (start < chunkStart - 1.5 || end > chunkEnd + 1.5) continue;
        const nearBoundary = (time: number) => cues.some((cue) =>
            Math.abs(time - cue.from) <= 2 || Math.abs(time - cue.to) <= 2
        );
        if (!nearBoundary(start) || !nearBoundary(end)) continue;
        if (end - start >= 20) {
            const captionedSeconds = cues.reduce((total, cue) =>
                total + Math.max(0, Math.min(end, cue.to) - Math.max(start, cue.from)), 0
            );
            if (captionedSeconds / (end - start) < 0.2) continue;
        }
        valid.push({ start, end });
    }
    return valid;
}

export function mergeRanges(ranges: SponsorRange[]): SponsorRange[] {
    const merged: SponsorRange[] = [];
    for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
        const previous = merged[merged.length - 1];
        if (previous && range.start <= previous.end + 1) previous.end = Math.max(previous.end, range.end);
        else merged.push({ ...range });
    }
    return merged.filter((range) => range.end - range.start <= 300);
}

export function skipTargetAt(ranges: SponsorRange[], currentTime: number): number | null {
    if (!Number.isFinite(currentTime)) return null;
    const range = ranges.find(({ start, end }) => currentTime >= start && currentTime < end - 0.1);
    return range?.end ?? null;
}
