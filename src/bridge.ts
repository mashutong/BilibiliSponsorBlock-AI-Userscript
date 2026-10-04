export interface GmResponse {
    status: number;
    responseText?: string;
    response?: unknown;
    finalUrl?: string;
}

export interface GmRequestOptions {
    method?: string;
    url: string;
    headers?: Record<string, string>;
    data?: string;
    timeout?: number;
    responseType?: "arraybuffer";
    anonymous?: boolean;
    redirect?: "error" | "follow";
}

declare function GM_xmlhttpRequest(options: GmRequestOptions & {
    onload: (response: GmResponse) => void;
    onerror: () => void;
    ontimeout: () => void;
    onabort: () => void;
}): void;
declare function GM_getValue<T>(key: string, defaultValue: T): T;
declare function GM_setValue(key: string, value: string): void;
declare function GM_deleteValue(key: string): void;
declare function GM_registerMenuCommand(label: string, callback: () => void): void;

export function request(options: GmRequestOptions): Promise<GmResponse> {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            ...options,
            timeout: options.timeout ?? 8000,
            onload: resolve,
            onerror: () => reject(new Error("Network request failed")),
            ontimeout: () => reject(new Error("Network request timed out")),
            onabort: () => reject(new Error("Network request aborted")),
        });
    });
}

export function getSetting(key: string): string {
    return GM_getValue(key, "");
}

export function setSetting(key: string, value: string): void {
    GM_setValue(key, value);
}

export function deleteSetting(key: string): void {
    GM_deleteValue(key);
}

export function addMenu(label: string, callback: () => void): void {
    GM_registerMenuCommand(label, callback);
}
