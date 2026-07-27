import Image from "next/image";
import { Link2 } from "lucide-react";
import type { BlogAuthor } from "@/lib/blog";

function socialUrl(network: string, value: string) {
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (network === "github") return `https://github.com/${value}`;
  if (network === "linkedin") return `https://www.linkedin.com/in/${value}`;
  if (network === "x") return `https://x.com/${value}`;
  if (network === "bluesky") return `https://bsky.app/profile/${value}`;
  return value;
}

export function BlogAuthor({ author, compact = false }: { author: BlogAuthor; compact?: boolean }) {
  if (compact) {
    return (
      <Image
        src={author.imageUrl || "/brand/logo.png"}
        alt={`${author.name} profile picture`}
        width={32}
        height={32}
        unoptimized
        className="rounded-full border-2 border-white object-cover"
      />
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Image
        src={author.imageUrl || "/brand/logo.png"}
        alt={`${author.name} profile picture`}
        width={44}
        height={44}
        unoptimized
        className="rounded-full object-cover"
      />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#1a1a1a]">{author.name}</p>
        {!compact && <p className="mt-0.5 text-xs text-black/48">{author.title}</p>}
        {!compact && Object.keys(author.socials).length > 0 && (
          <div className="mt-1.5 flex items-center gap-2">
            {Object.entries(author.socials).map(([network, handle]) => {
              return (
                <a
                  key={network}
                  href={socialUrl(network, handle)}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`${author.name} on ${network}`}
                  className="rounded-md p-1 text-black/45 transition-colors hover:bg-black/[0.05] hover:text-[#ff4a2c]"
                >
                  <Link2 className="h-5 w-5" />
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
