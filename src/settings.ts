import { clearAnalysisCache } from "./analysis";
import { addMenu, deleteSetting, getSetting, setSetting } from "./bridge";

const hostId = "bsb-ai-settings";

function openSettings(): void {
    document.getElementById(hostId)?.remove();
    const previousFocus = document.activeElement as HTMLElement | null;
    const host = document.createElement("div");
    host.id = hostId;
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
        <style>
            * { box-sizing: border-box; }
            .backdrop { position: absolute; inset: 0; display: grid; place-items: center;
                background: rgba(0, 0, 0, .55); font: 14px/1.5 system-ui, sans-serif; color: #222; }
            .panel { width: min(420px, calc(100vw - 32px)); padding: 22px; border-radius: 12px;
                background: #fff; box-shadow: 0 12px 40px rgba(0, 0, 0, .3); }
            h2 { margin: 0 0 12px; font-size: 18px; }
            p { margin: 8px 0; }
            label { display: block; margin: 16px 0 6px; font-weight: 600; }
            input { width: 100%; padding: 9px 10px; border: 1px solid #999; border-radius: 6px;
                font: inherit; color: #222; background: #fff; }
            .hint { color: #666; font-size: 12px; }
            .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
            button { padding: 8px 14px; border: 1px solid #aaa; border-radius: 6px; background: #fff;
                color: #222; font: inherit; cursor: pointer; }
            button.primary { border-color: #00a1d6; background: #00a1d6; color: #fff; }
            button:focus-visible, input:focus-visible { outline: 2px solid #00a1d6; outline-offset: 2px; }
            [hidden] { display: none !important; }
        </style>
        <div class="backdrop">
            <section class="panel" role="dialog" aria-modal="true" aria-labelledby="title">
                <h2 id="title">AI 字幕跳广告设置</h2>
                <p id="status"></p>
                <label for="api-key">DeepSeek API Key</label>
                <input id="api-key" type="password" autocomplete="off" spellcheck="false"
                    placeholder="粘贴新的 API Key" aria-describedby="hint">
                <p id="hint" class="hint">Key 保存在此设备的 Tampermonkey 中；保存后，下一个视频开始播放时生效。</p>
                <div class="actions">
                    <button id="clear" type="button">清除 Key</button>
                    <button id="cancel" type="button">取消</button>
                    <button id="save" class="primary" type="button">保存</button>
                </div>
            </section>
        </div>`;
    document.body.append(host);

    const input = shadow.querySelector<HTMLInputElement>("#api-key")!;
    const status = shadow.querySelector<HTMLElement>("#status")!;
    const clear = shadow.querySelector<HTMLButtonElement>("#clear")!;
    const close = () => {
        host.remove();
        previousFocus?.focus();
    };
    const updateStatus = () => {
        const saved = Boolean(getSetting("aiApiKey"));
        status.textContent = saved ? "状态：已设置 Key（不会显示原值）" : "状态：未设置 Key";
        clear.hidden = !saved;
    };
    updateStatus();

    shadow.querySelector<HTMLButtonElement>("#save")!.addEventListener("click", () => {
        const key = input.value.trim();
        if (!key) {
            status.textContent = "请输入新的 DeepSeek API Key。";
            input.focus();
            return;
        }
        setSetting("aiApiKey", key);
        clearAnalysisCache();
        close();
    });
    clear.addEventListener("click", () => {
        if (!window.confirm("清除此设备保存的 DeepSeek API Key？")) return;
        deleteSetting("aiApiKey");
        clearAnalysisCache();
        close();
    });
    shadow.querySelector<HTMLButtonElement>("#cancel")!.addEventListener("click", close);
    shadow.querySelector(".backdrop")!.addEventListener("click", (event) => {
        if (event.target === event.currentTarget) close();
    });
    shadow.addEventListener("keydown", (event) => {
        if ((event as KeyboardEvent).key === "Escape") close();
    });
    input.focus();
}

export function registerSettingsMenu(): void {
    addMenu("设置 DeepSeek API Key", openSettings);
}
