import { analyseSubtitles, clearAnalysisCache } from "./analysis";
import { addMenu, deleteSetting, getSetting, request, setSetting } from "./bridge";
import { mergeRanges, minimumAiVideoDuration, parseVideoAddress, skipTargetAt, SponsorRange } from "./core";
import { lookupSegments, submitSegments } from "./server";
import { getSubtitleCues } from "./subtitles";

interface VideoIdentity {
    bvid: string;
    cid: string;
}

declare const unsafeWindow: Window & {
    player?: { getManifest?: () => { bvid?: string; cid?: number | string } };
};

const logPrefix = "[BSB AI userscript]";
let currentVideo: HTMLVideoElement | null = null;
let currentRoute = "";
let generation = 0;
let started = false;
let ranges: SponsorRange[] = [];
let lastSkipEnd = -1;

function routeKey(): string {
    const url = new URL(location.href);
    return `${url.pathname}?bvid=${url.searchParams.get("bvid") ?? ""}&p=${url.searchParams.get("p") ?? "1"}`;
}

function getPlayerVideo(): HTMLVideoElement | null {
    return document.querySelector("#bilibili-player video") as HTMLVideoElement | null;
}

function stillCurrent(video: HTMLVideoElement, token: number): boolean {
    return generation === token && currentVideo === video && video.isConnected && currentRoute === routeKey();
}

function currentIdentityFromPlayer(expectedBvid: string | null): VideoIdentity | null {
    try {
        const manifest = unsafeWindow.player?.getManifest?.();
        const bvid = manifest?.bvid;
        const cid = String(manifest?.cid ?? "");
        if (/^BV[0-9A-Za-z]{10}$/.test(bvid ?? "") && /^\d+$/.test(cid) &&
            (!expectedBvid || bvid === expectedBvid)) return { bvid: bvid!, cid };
    } catch (_) {
        // The page player API is optional; fall back to the view API.
    }
    return null;
}

async function resolveVideoIdentity(): Promise<VideoIdentity | null> {
    const address = parseVideoAddress(location.href);
    const fromPlayer = currentIdentityFromPlayer(address?.bvid ?? null);
    if (fromPlayer) return fromPlayer;
    if (!address) return null;

    const response = await request({
        url: `https://api.bilibili.com/x/web-interface/view?${new URLSearchParams({ bvid: address.bvid })}`,
        timeout: 8000,
        redirect: "error",
    });
    if (response.status !== 200) return null;
    const view = JSON.parse(response.responseText ?? "");
    const page = view?.data?.pages?.find((item: { page?: number }) => item?.page === address.page);
    const cid = String(page?.cid ?? "");
    if (view?.code !== 0 || view?.data?.bvid !== address.bvid || !/^\d+$/.test(cid)) return null;
    return { bvid: address.bvid, cid };
}

function checkSkip(): void {
    const video = currentVideo;
    if (!video || !ranges.length) return;
    const target = skipTargetAt(ranges, video.currentTime);
    if (target === null) {
        lastSkipEnd = -1;
        return;
    }
    if (target === lastSkipEnd) return;
    lastSkipEnd = target;
    video.currentTime = target;
}

function setRanges(next: SponsorRange[]): void {
    ranges = mergeRanges([...ranges, ...next]);
    lastSkipEnd = -1;
    checkSkip();
}

async function runAnalysis(video: HTMLVideoElement, token: number): Promise<void> {
    const duration = video.duration;
    const apiKey = getSetting("aiApiKey").trim();
    if (!Number.isFinite(duration) || duration <= minimumAiVideoDuration || !apiKey) return;

    try {
        const identity = await resolveVideoIdentity();
        if (!identity || !stillCurrent(video, token)) return;
        const { bvid, cid } = identity;
        const initial = await lookupSegments(bvid, cid);
        if (!stillCurrent(video, token) || initial.hasRawSegments) return;

        const cues = await getSubtitleCues(bvid, cid);
        if (!stillCurrent(video, token) || !cues.length) return;
        let result = await analyseSubtitles(`${bvid}:${cid}:${duration}`, cues, duration, apiKey);
        if (!stillCurrent(video, token)) return;
        if (result.ranges.length) setRanges(result.ranges);

        for (let attempt = 1; !result.complete && attempt < 3; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 30000));
            if (!stillCurrent(video, token)) return;
            result = await analyseSubtitles(`${bvid}:${cid}:${duration}`, cues, duration, apiKey);
            if (!stillCurrent(video, token)) return;
            if (result.ranges.length) setRanges(result.ranges);
        }
        if (!result.complete || !ranges.length || !stillCurrent(video, token)) return;
        if (Math.abs(video.duration - duration) > 1) return;

        // Recheck after inference so a simultaneous submission cannot be duplicated.
        const latest = await lookupSegments(bvid, cid, true);
        if (!stillCurrent(video, token) || latest.hasRawSegments) return;
        const accepted = await submitSegments(latest.server, bvid, cid, duration, ranges);
        if (!accepted) console.warn(`${logPrefix} SponsorBlock did not confirm the AI submission`);
    } catch (error) {
        console.warn(`${logPrefix} Analysis unavailable`, error);
    }
}

function onPlaying(): void {
    const video = currentVideo;
    if (!video || video.paused) return;
    checkSkip();
    if (started) return;
    if (!Number.isFinite(video.duration) || video.duration <= minimumAiVideoDuration) return;
    started = true;
    void runAnalysis(video, generation);
}

function refreshPlayer(): void {
    const video = getPlayerVideo();
    const route = routeKey();
    if (video === currentVideo && route === currentRoute) return;
    if (currentVideo) {
        currentVideo.removeEventListener("playing", onPlaying);
        currentVideo.removeEventListener("loadedmetadata", onPlaying);
        currentVideo.removeEventListener("timeupdate", checkSkip);
        currentVideo.removeEventListener("seeked", checkSkip);
    }
    currentVideo = video;
    currentRoute = route;
    generation++;
    started = false;
    ranges = [];
    lastSkipEnd = -1;
    if (!video) return;
    video.addEventListener("playing", onPlaying);
    video.addEventListener("loadedmetadata", onPlaying);
    video.addEventListener("timeupdate", checkSkip);
    video.addEventListener("seeked", checkSkip);
    if (!video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) onPlaying();
}

addMenu("设置 DeepSeek API Key", () => {
    const key = window.prompt("请输入 DeepSeek API Key（只保存在此设备的 Tampermonkey 中）", "");
    if (key?.trim()) {
        setSetting("aiApiKey", key.trim());
        clearAnalysisCache();
        window.alert("已保存。下一个视频开始播放时生效。");
    }
});
addMenu("清除 DeepSeek API Key", () => {
    if (!window.confirm("清除此设备保存的 DeepSeek API Key？")) return;
    deleteSetting("aiApiKey");
    clearAnalysisCache();
    window.alert("已清除。");
});

refreshPlayer();
setInterval(refreshPlayer, 750);
