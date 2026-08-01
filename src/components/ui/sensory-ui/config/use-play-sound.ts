"use client";
import { useCallback } from "react";
import { type SoundRole } from "./config";
import { useSensoryUI } from "./provider";
export function usePlaySound({ sound }: { sound: SoundRole }) { const { play: invoke } = useSensoryUI(); return { play: useCallback(() => invoke(sound), [invoke, sound]) }; }
