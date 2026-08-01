import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistPixelCircle, GeistPixelGrid, GeistPixelLine, GeistPixelSquare, GeistPixelTriangle } from "geist/font/pixel";
import { SensoryUIProvider } from "@/components/ui/sensory-ui/config/provider";
import { DialogProvider } from "@/components/dialog-provider";
import { sensoryConfig } from "@/sensory.config";
import "./globals.css";

export const metadata: Metadata = { title: "Boendjaya POS", description: "F&B point of sale, stock, and COGS" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id" className={`${GeistMono.variable} ${GeistPixelSquare.variable} ${GeistPixelCircle.variable} ${GeistPixelGrid.variable} ${GeistPixelTriangle.variable} ${GeistPixelLine.variable}`}><body><SensoryUIProvider config={sensoryConfig}><DialogProvider>{children}</DialogProvider></SensoryUIProvider></body></html>;
}
