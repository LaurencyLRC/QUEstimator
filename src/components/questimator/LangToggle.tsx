"use client";

import { useLang, type Lang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

const LANGS: { code: Lang; label: string }[] = [
  { code: "ko", label: "한" },
  { code: "en", label: "EN" },
];

export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div className="inline-flex items-center p-0.5 rounded-md bg-muted/40 border border-border/80 font-mono text-[11px]">
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => setLang(l.code)}
          className={`px-2 py-1 rounded transition-all font-medium ${
            lang === l.code
              ? "bg-card text-foreground shadow-sm border border-border/80"
              : "text-muted-foreground hover:text-foreground"
          }`}
          aria-label={l.code === "en" ? "English" : "한국어"}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
