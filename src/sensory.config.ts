import type { SensoryUIConfig } from "@/components/ui/sensory-ui/config/config";

export const sensoryConfig: Partial<SensoryUIConfig> = {
  enabled: true, volume: 0.4, theme: "arcade",
  categories: { interaction: true, overlay: true, navigation: true, notification: true, hero: true },
  reducedMotion: "inherit", overrides: {},
};
