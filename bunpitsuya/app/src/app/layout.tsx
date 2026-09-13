import type { Metadata } from "next";
import "./globals.css";
import { BRAND } from "@/lib/brand";

const TYPEKIT = String.raw`(function(d){var config={kitId:"suz4xen",scriptTimeout:3000,async:true},h=d.documentElement,t=setTimeout(function(){h.className=h.className.replace(/\bwf-loading\b/g,"")+" wf-inactive";},config.scriptTimeout),tk=d.createElement("script"),f=false,s=d.getElementsByTagName("script")[0],a;h.className+=" wf-loading";tk.src="https://use.typekit.net/"+config.kitId+".js";tk.async=true;tk.onload=tk.onreadystatechange=function(){a=this.readyState;if(f||a&&a!="complete"&&a!="loaded")return;f=true;clearTimeout(t);try{Typekit.load(config)}catch(e){}};s.parentNode.insertBefore(tk,s)})(document);`;

export const metadata: Metadata = {
  title: BRAND.name,
  description: "文章を「書く」のではなく「仕立てる」店。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        {/* Adobe Fonts（ありんこ = ads-arinco） */}
        <script dangerouslySetInnerHTML={{ __html: TYPEKIT }} />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@400;500;600;700&family=Zen+Kurenaido&family=IBM+Plex+Mono:wght@400;500&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
