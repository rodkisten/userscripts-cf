export function normalizeVisual(source = {}) {
  const v = source && typeof source === "object" ? source : {};
  return {
    snap: v.snap === true,
    feedFilters:
      v.feedFilters && typeof v.feedFilters === "object"
        ? Object.fromEntries(
            Object.entries(v.feedFilters)
              .slice(-300)
              .map(([key, value]) => [
                key,
                {
                  reposts: value?.reposts !== false,
                  media: ["all", "media", "video", "image"].includes(value?.media) ? value.media : "media",
                },
              ]),
          )
        : {},
    density: Math.min(1.4, Math.max(0.55, Number(v.density) || 1)),
    font: Math.min(19, Math.max(11, Number(v.font) || 15)),
    compact: v.compact === true,
    colorfulTags: v.colorfulTags === true,
    hideSeen: Boolean(v.hideSeen),
    viewedThreshold: Math.min(0.9, Math.max(0.35, Number(v.viewedThreshold) || 0.65)),
    seenDelayMs: Math.min(8000, Math.max(1000, Number(v.seenDelayMs) || 2500)),
    translatePosts: v.translatePosts !== false,
    blockTweetOpen: v.blockTweetOpen !== false,
    translateForeignTags: v.translateForeignTags !== false,
    seekPreviews: v.seekPreviews !== false,
    videoPauseDim: v.videoPauseDim === true,
    previewStepSeconds: Math.max(1, Math.min(15, Number(v.previewStepSeconds) || 5)),
    playerMode: ["twitter", "rodx", "videojs"].includes(v.playerMode) ? v.playerMode : "videojs",
    videoMute: v.videoMute !== false,
    bestQuality: v.bestQuality !== false,
    autoPlayEnterPercent: Math.min(100, Math.max(10, Number(v.autoPlayEnterPercent) || 55)),
    autoPauseExitPercent: Math.min(100, Math.max(10, Number(v.autoPauseExitPercent) || 75)),
    swipeToCloseVideo: v.swipeToCloseVideo !== false,
  };
}
