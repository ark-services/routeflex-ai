"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function ArticleContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none text-rf-text-primary prose-headings:text-rf-text-primary prose-a:text-rf-blue prose-code:text-sm prose-code:bg-rf-ink-100/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-rf-surface-card prose-pre:border prose-pre:border-rf-border prose-img:rounded-rf-lg prose-strong:text-rf-text-primary prose-li:text-rf-text-secondary">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
