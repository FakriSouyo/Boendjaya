"use client";
import { forwardRef } from "react";
import { type SoundRole } from "./config/config";
import { usePlaySound } from "./config/use-play-sound";
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { sound?: SoundRole; variant?: "default" | "outline" | "ghost"; size?: "icon" };
export const Button = forwardRef<HTMLButtonElement, Props>(({ sound = "interaction.tap", variant = "default", size, className = "", onClick, ...props }, ref) => { const { play } = usePlaySound({ sound }); const styles = variant === "default" ? "bg-[#ef4130] text-white hover:bg-[#cf2819]" : variant === "outline" ? "border border-[#d8ccc6] bg-white text-[#17100e] hover:border-[#ef4130] hover:text-[#e73b28]" : "bg-transparent"; return <button ref={ref} onClick={e => { play(); onClick?.(e); }} className={`inline-flex items-center justify-center gap-2 px-3 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-40 ${size === "icon" ? "size-9 p-0" : ""} ${styles} ${className}`} {...props} />; });
Button.displayName = "Button";
