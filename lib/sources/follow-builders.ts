import fs from "node:fs";
import path from "node:path";
import type { RawArticle } from "./types";

const DEFAULT_ROOT = "/Users/yan/.follow-builders";

const PROMPT_LABELS: Record<string, string> = {
  "digest-intro.md": "最终日报组织规则",
  "summarize-blogs.md": "AI 公司博客总结规则",
  "summarize-podcast.md": "播客总结规则",
  "summarize-tweets.md": "X/Twitter 总结规则",
  "summarize-youtube.md": "YouTube 总结规则",
  "translate.md": "翻译规则",
};

function compactMarkdown(text: string): string {
  return text
    .replace(/^#\s+/gm, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fileUrl(filePath: string): string {
  return `file://${filePath}`;
}

function fileMtime(filePath: string): Date | undefined {
  try {
    return fs.statSync(filePath).mtime;
  } catch {
    return undefined;
  }
}

export async function fetchFollowBuilders(
  sourceId: string,
): Promise<RawArticle[]> {
  const root = process.env.FOLLOW_BUILDERS_DIR?.trim() || DEFAULT_ROOT;
  if (!fs.existsSync(root)) {
    throw new Error(`follow-builders directory not found: ${root}`);
  }

  const articles: RawArticle[] = [];
  const configPath = path.join(root, "config.json");
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      language?: string;
      frequency?: string;
      timezone?: string;
      deliveryTime?: string;
      delivery?: { method?: string };
    };
    const bits = [
      config.frequency && `频率 ${config.frequency}`,
      config.timezone && `时区 ${config.timezone}`,
      config.deliveryTime && `推送时间 ${config.deliveryTime}`,
      config.language && `语言 ${config.language}`,
      config.delivery?.method && `输出方式 ${config.delivery.method}`,
    ].filter(Boolean);
    articles.push({
      sourceId,
      title: "Follow Builders 本地配置",
      url: fileUrl(configPath),
      excerpt: bits.join(" · ") || "本地 follow-builders 配置",
      publishedAt: fileMtime(configPath),
      category: "tech",
      meta: root,
    });
  }

  const promptsDir = path.join(root, "prompts");
  if (fs.existsSync(promptsDir)) {
    const promptFiles = fs
      .readdirSync(promptsDir)
      .filter((name) => name.endsWith(".md"))
      .sort();
    for (const name of promptFiles) {
      const promptPath = path.join(promptsDir, name);
      const body = compactMarkdown(fs.readFileSync(promptPath, "utf8"));
      articles.push({
        sourceId,
        title: `Follow Builders: ${PROMPT_LABELS[name] ?? name}`,
        url: fileUrl(promptPath),
        excerpt: body.slice(0, 300),
        publishedAt: fileMtime(promptPath),
        category: "tech",
        meta: name,
      });
    }
  }

  return articles;
}
