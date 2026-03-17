import { getArticle } from "@/lib/help-center/actions";
import { Chatbot } from "@/components/help-center/Chatbot";
import { ArticleContent } from "@/components/help-center/ArticleContent";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { notFound } from "next/navigation";

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ categorySlug: string; articleSlug: string }>;
}) {
  const { categorySlug, articleSlug } = await params;
  const article = await getArticle(categorySlug, articleSlug);

  if (!article) notFound();

  return (
    <>
      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-rf-text-muted mb-6 flex-wrap">
          <Link
            href="/help-center"
            className="hover:text-rf-text-secondary transition-colors"
          >
            Help Center
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link
            href={`/help-center/${article.category.slug}`}
            className="hover:text-rf-text-secondary transition-colors"
          >
            {article.category.title}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-rf-text-secondary font-medium">
            {article.title}
          </span>
        </nav>

        <h1 className="text-2xl font-bold text-rf-text-primary">
          {article.title}
        </h1>
        {article.summary && (
          <p className="mt-2 text-sm text-rf-text-secondary">
            {article.summary}
          </p>
        )}
        <div className="mt-1 text-xs text-rf-text-muted">
          Last updated{" "}
          {new Date(article.updated_at).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </div>

        {/* Tags */}
        {article.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {article.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs text-rf-text-muted bg-rf-ink-100/50 px-2.5 py-0.5 rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Article body */}
        <div className="mt-8">
          <ArticleContent content={article.content} />
        </div>
      </div>

      <Chatbot />
    </>
  );
}
