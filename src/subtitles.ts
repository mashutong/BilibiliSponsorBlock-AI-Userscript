import { request } from "./bridge";
import { SubtitleCue } from "./core";

interface SubtitleTrack {
    lan: string;
    subtitle_url: string;
    type?: number;
}

interface ProtoField {
    number: number;
    data?: Uint8Array;
}

const api = "https://api.bilibili.com";
const maxProtoBytes = 1024 * 1024;
const decoder = new TextDecoder("utf-8", { fatal: true });

async function getJson(url: string, anonymous = false): Promise<unknown> {
    const response = await request({ url, anonymous, redirect: "error" });
    if (response.status !== 200) throw new Error(`Subtitle request failed (${response.status})`);
    return JSON.parse(response.responseText ?? "");
}

function readVarint(bytes: Uint8Array, start: number): [number, number] {
    let value = 0;
    for (let offset = start, shift = 0; offset < bytes.length && shift < 70; offset++, shift += 7) {
        const byte = bytes[offset];
        value += (byte & 0x7f) * 2 ** shift;
        if ((byte & 0x80) === 0) return [value, offset + 1];
    }
    throw new Error("Invalid Bilibili subtitle metadata");
}

function decodeFields(bytes: Uint8Array): ProtoField[] {
    const fields: ProtoField[] = [];
    let offset = 0;
    while (offset < bytes.length) {
        const [key, afterKey] = readVarint(bytes, offset);
        const number = Math.floor(key / 8);
        const wire = key % 8;
        if (!Number.isSafeInteger(number) || number < 1) throw new Error("Invalid Bilibili subtitle metadata");
        offset = afterKey;
        if (wire === 0) {
            [, offset] = readVarint(bytes, offset);
        } else if (wire === 1 || wire === 5) {
            offset += wire === 1 ? 8 : 4;
        } else if (wire === 2) {
            const [length, afterLength] = readVarint(bytes, offset);
            offset = afterLength;
            if (!Number.isSafeInteger(length) || length < 0 || offset + length > bytes.length) {
                throw new Error("Invalid Bilibili subtitle metadata");
            }
            fields.push({ number, data: bytes.subarray(offset, offset + length) });
            offset += length;
        } else {
            throw new Error("Unsupported Bilibili subtitle metadata");
        }
        if (offset > bytes.length) throw new Error("Invalid Bilibili subtitle metadata");
    }
    return fields;
}

function parseCurrentTracks(bytes: Uint8Array): SubtitleTrack[] {
    const data = decodeFields(bytes).find((field) => field.number === 1)?.data;
    if (!data) return [];
    const tracks: SubtitleTrack[] = [];
    for (const field of decodeFields(data)) {
        if (field.number !== 3 || !field.data) continue;
        const parts = decodeFields(field.data);
        const language = parts.find((part) => part.number === 3)?.data;
        const url = parts.find((part) => part.number === 5)?.data;
        if (language && url) tracks.push({ lan: decoder.decode(language), subtitle_url: decoder.decode(url) });
    }
    return tracks;
}

async function getLegacyTracks(bvid: string, cid: string): Promise<SubtitleTrack[]> {
    const params = new URLSearchParams({ bvid, cid });
    const payload = await getJson(`${api}/x/player/v2?${params}`) as {
        code?: number;
        data?: { subtitle?: { subtitles?: SubtitleTrack[] } };
    };
    if (payload?.code !== 0) throw new Error("Bilibili subtitle metadata unavailable");
    const tracks = payload.data?.subtitle?.subtitles;
    return Array.isArray(tracks) ? tracks : [];
}

async function getCurrentTracks(bvid: string, cid: string): Promise<SubtitleTrack[]> {
    const view = await getJson(`${api}/x/web-interface/view?${new URLSearchParams({ bvid })}`) as {
        code?: number;
        data?: { aid?: number };
    };
    const aid = view.data?.aid;
    if (view.code !== 0 || !Number.isSafeInteger(aid)) throw new Error("Bilibili video metadata unavailable");
    const params = new URLSearchParams({
        oid: cid,
        pid: String(aid),
        context_ext: JSON.stringify({ video_type: 1 }),
        type: "1",
        cur_production_type: "0",
        preferred_language: "ai-zh",
        playlist_switch: "0",
    });
    for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) await new Promise((resolve) => setTimeout(resolve, attempt * 250));
        const response = await request({
            url: `${api}/x/v2/subtitle/web/view?${params}`,
            responseType: "arraybuffer",
            redirect: "error",
        });
        const buffer = response.response as ArrayBuffer | undefined;
        if (response.status !== 200 || !buffer || typeof buffer.byteLength !== "number") {
            throw new Error("Bilibili AI subtitle metadata unavailable");
        }
        const bytes = new Uint8Array(buffer);
        if (bytes.length > maxProtoBytes) throw new Error("Bilibili subtitle metadata too large");
        const tracks = parseCurrentTracks(bytes);
        if (tracks.length) return tracks;
    }
    return [];
}

function subtitleUrl(raw: string): URL | null {
    if (typeof raw !== "string") return null;
    try {
        const url = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
        const host = url.hostname.toLowerCase();
        if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
        if (host !== "subtitle.bilibili.com" && host !== "hdslb.com" && !host.endsWith(".hdslb.com")) return null;
        return url;
    } catch (_) {
        return null;
    }
}

function trackPriority(track: SubtitleTrack): number {
    const language = track.lan.toLowerCase();
    const chinese = language.startsWith("zh") || language.startsWith("ai-zh");
    const ai = language.startsWith("ai-") || track.type === 1;
    return (chinese ? 0 : 2) + (ai ? 1 : 0);
}

async function downloadCues(tracks: SubtitleTrack[]): Promise<SubtitleCue[]> {
    const candidates = tracks
        .filter((track) => track && typeof track.lan === "string" && subtitleUrl(track.subtitle_url))
        .sort((a, b) => trackPriority(a) - trackPriority(b));
    for (const track of candidates) {
        const url = subtitleUrl(track.subtitle_url)!;
        try {
            const payload = await getJson(url.href, !url.hostname.endsWith(".bilibili.com")) as {
                body?: SubtitleCue[];
            };
            if (!Array.isArray(payload?.body)) continue;
            const cues = payload.body
                .filter((cue) => Number.isFinite(cue?.from) && Number.isFinite(cue?.to) &&
                    cue.from >= 0 && cue.to > cue.from && typeof cue.content === "string" && cue.content.trim())
                .map((cue) => ({ from: cue.from, to: cue.to, content: cue.content.trim() }));
            if (cues.length) return cues;
        } catch (_) {
            // Signed subtitle URLs can expire; try another track.
        }
    }
    return [];
}

export async function getSubtitleCues(bvid: string, cid: string): Promise<SubtitleCue[]> {
    if (!/^BV[0-9A-Za-z]{10}$/.test(bvid) || !/^\d+$/.test(cid)) return [];
    try {
        const cues = await downloadCues(await getLegacyTracks(bvid, cid));
        if (cues.length) return cues;
    } catch (_) {
        // The current subtitle API may still have an AI track.
    }
    return downloadCues(await getCurrentTracks(bvid, cid));
}
