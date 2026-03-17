import { getCategoryBySlug } from "@/lib/help-center/actions";
import { Chatbot } from "@/components/help-center/Chatbot";
import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";
import { notFound } from "next/navigation";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ categorySlug: string }>;
}) {
  const { categorySlug } = await params;
  const category = await getCategoryBySlug(categorySlug);

  if (!category) notFound();

  return (
    <>
      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-rf-text-muted mb-6">
          <Link
            href="/help-center"
            className="hover:text-rf-text-secondary transition-colors"
          >
            Help Center
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-rf-text-secondary font-medium">
            {category.title}
          </span>
        </nav>

        <h1 className="text-2xl font-bold text-rf-text-primary">
          {category.title}
        </h1>
        {category.description && (
          <p className="mt-2 text-sm text-rf-text-secondary">
            {category.description}
          </p>
        )}

        {/* Articles list */}
        <div className="mt-8 space-y-2">
          {category.articles.length > 0 ? (
            category.articles.map((article) => (
              <Link
                key={article.id}
                href={`/help-center/${categorySlug}/${article.slug}`}
                className="flex items-start gap-3 p-4 bg-rf-surface-card border border-rf-border rounded-rf-lg hover:border-rf-blue/40 hover:shadow-rf-sm transition-all"
              >
                <FileText className="h-4 w-4 mt-0.5 text-rf-blue shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-rf-text-primary">
                    {article.title}
                  </h3>
                  {article.summary && (
                    <p className="mt-0.5 text-xs text-rf-text-muted line-clamp-2">
                      {article.summary}
                    </p>
                  )}
                  {article.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {article.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] text-rf-text-muted bg-rf-ink-100/50 px-2 py-0.5 rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))
          ) : (
            <p className="text-sm text-rf-text-muted py-8 text-center">
              No articles in this category yet.
            </p>
          )}
        </div>
      </div>

      <Chatbot />
    </>
  );
}
