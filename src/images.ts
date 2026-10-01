import { convertFileSrc } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";

let assetsDirectory: Promise<string> | undefined;

export function resolvePreviewImages(preview: HTMLElement) {
  for (const image of preview.querySelectorAll<HTMLImageElement>("img[src]")) {
    const source = image.getAttribute("src")!;
    // Remote URLs and data URLs already have their own location.
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(source)) continue;

    image.removeAttribute("src");
    let path: string;
    try {
      path = decodeURIComponent(source.split(/[?#]/, 1)[0]);
    } catch {
      continue;
    }
    const parts = path.split("/").filter((part) => part !== "." && part !== "");
    if (!parts.length || path.startsWith("/") || /[\\\0:]/.test(path) || parts.includes("..")) continue;

    assetsDirectory ??= appDataDir().then((directory) => join(directory, "assets"));
    void assetsDirectory
      .then((directory) => join(directory, ...parts))
      .then((filePath) => {
        // A mode switch or another note may have removed this image meanwhile.
        if (preview.contains(image)) image.src = convertFileSrc(filePath);
      })
      .catch((error) => {
        assetsDirectory = undefined;
        console.error("Could not resolve note image:", error);
      });
  }
}
