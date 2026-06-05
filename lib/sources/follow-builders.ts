import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RawArticle } from "./types";

const execFileP = promisify(execFile);

const BASE_URL =
  "https://raw.githubusercontent.com/zarazhangrui/follow-builders/main";
const DEFAULT_PROXY = "http://127.0.0.1:7897";

interface XFeed {
  generatedAt?: string;
  x?: Array<{
    name: string;
    handle?: string;
    tweets?: Array<{
      text: string;
      createdAt?: string;
      url: string;
      likes?: number;
      retweets?: number;
      replies?: number;
      isQuote?: boolean;
    }>;
  }>;
}

interface PodcastFeed {
  podcasts?: Array<{
    name: string;
    title: string;
    url: string;
    publishedAt?: string;
    transcript?: string;
  }>;
}

interface BlogFeed {
  blogs?: Array<{
    name: string;
    title: string;
    url: string;
    publishedAt?: string | null;
    author?: string;
    description?: string;
    content?: string;
  }>;
}

function stripText(text: string | undefined): string {
  return (text ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

async function fetchJson<T>(file: string): Promise<T> {
  const url = `${BASE_URL}/${file}`;
  const proxy = process.env.FOLLOW_BUILDERS_PROXY ?? DEFAULT_PROXY;
  const directArgs = ["-sSL", "-m", "25", "--compressed", url];
  const proxyArgs = proxy
    ? ["-sSL", "-m", "25", "--compressed", "--proxy", proxy, url]
    : directArgs;

  try {
    const { stdout } = await execFileP("curl", directArgs, {
      maxBuffer: 32 * 1024 * 1024,
    });
    return JSON.parse(stdout) as T;
  } catch {
    const { stdout } = await execFileP("curl", proxyArgs, {
      maxBuffer: 32 * 1024 * 1024,
    });
    return JSON.parse(stdout) as T;
  }
}

function xArticles(sourceId: string, feed: XFeed): RawArticle[] {
  const articles: RawArticle[] = [];
  for (const builder of feed.x ?? []) {
    for (const tweet of builder.tweets ?? []) {
      const text = stripText(tweet.text);
      if (!text || !tweet.url) continue;
      articles.push({
        sourceId,
        title: `${builder.name}: ${text.slice(0, 90)}`,
        url: tweet.url,
        excerpt: text.slice(0, 300),
        publishedAt: parseDate(tweet.createdAt),
        category: "tech",
        meta: [
          "X",
          builder.handle && `${builder.handle}`,
          typeof tweet.likes === "number" && `${tweet.likes} likes`,
          typeof tweet.retweets === "number" && `${tweet.retweets} reposts`,
          typeof tweet.replies === "number" && `${tweet.replies} replies`,
          tweet.isQuote && "quote",
        ]
          .filter(Boolean)
          .join(" · "),
      });
    }
  }
  return articles;
}

function podcastArticles(sourceId: string, feed: PodcastFeed): RawArticle[] {
  return (feed.podcasts ?? [])
    .filter((podcast) => podcast.title && podcast.url)
    .map((podcast) => ({
      sourceId,
      title: `${podcast.name}: ${podcast.title}`,
      url: podcast.url,
      excerpt: stripText(podcast.transcript).slice(0, 300),
      publishedAt: parseDate(podcast.publishedAt),
      category: "tech" as const,
      meta: "Podcast transcript",
    }));
}

function blogArticles(sourceId: string, feed: BlogFeed): RawArticle[] {
  return (feed.blogs ?? [])
    .filter((blog) => blog.title && blog.url)
    .map((blog) => ({
      sourceId,
      title: `${blog.name}: ${blog.title}`,
      url: blog.url,
      excerpt: stripText(blog.description || blog.content).slice(0, 300),
      publishedAt: parseDate(blog.publishedAt),
      category: "tech" as const,
      meta: ["Blog", blog.author].filter(Boolean).join(" · "),
    }));
}

export async function fetchFollowBuilders(
  sourceId: string,
): Promise<RawArticle[]> {
  const [xFeed, podcastFeed, blogFeed] = await Promise.all([
    fetchJson<XFeed>("feed-x.json"),
    fetchJson<PodcastFeed>("feed-podcasts.json"),
    fetchJson<BlogFeed>("feed-blogs.json"),
  ]);

  return [
    ...xArticles(sourceId, xFeed),
    ...podcastArticles(sourceId, podcastFeed),
    ...blogArticles(sourceId, blogFeed),
  ].sort(
    (a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
  );
}
