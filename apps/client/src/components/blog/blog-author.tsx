import { Link2 } from "lucide-react";
import type { BlogAuthor as BlogAuthorType } from "#/lib/types/blog";

function socialUrl(network: string, value: string) {
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (network === "github") return `https://github.com/${value}`;
  if (network === "linkedin") return `https://www.linkedin.com/in/${value}`;
  if (network === "x") return `https://x.com/${value}`;
  if (network === "bluesky") return `https://bsky.app/profile/${value}`;
  return value;
}

export function BlogAuthor({
  author,
  compact = false,
}: {
  author: BlogAuthorType;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <img
        src={author.imageUrl || "/brand/mascot.png"}
        alt={author.name}
        width={32}
        height={32}
        className="rounded-full border-2 border-white object-cover"
        loading="lazy"
      />
    );
  }

  return (
    <div className="flex items-center gap-3">
      <img
        src={author.imageUrl || "/brand/mascot.png"}
        alt={author.name}
        width={44}
        height={44}
        className="rounded-full object-cover"
        loading="lazy"
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
