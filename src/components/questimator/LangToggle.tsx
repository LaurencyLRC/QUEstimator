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
    <div className="flex items-center rounded-md border border-border/60 overflow-hidden">
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => setLang(l.code)}
          className={`px-2 py-1 text-[11px] font-medium transition-colors ${
            lang === l.code
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted/60"
          }`}
          aria-label={l.code === "en" ? "English" : "한국어"}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
