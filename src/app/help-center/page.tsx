import { getCategories } from "@/lib/help-center/actions";
import { SearchBar } from "@/components/help-center/SearchBar";
import { CategoryCard } from "@/components/help-center/CategoryCard";
import { Chatbot } from "@/components/help-center/Chatbot";
import Link from "next/link";
import { LifeBuoy, MessageCircle } from "lucide-react";

export default async function HelpCenterPage() {
  const categories = await getCategories();

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-b from-rf-blue/5 to-transparent pt-16 pb-12 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-rf-text-primary">
            How can we help you?
          </h1>
          <p className="mt-3 text-rf-text-secondary text-sm md:text-base">
            Search our documentation, browse guides, or chat with our AI
            assistant.
          </p>
          <div className="mt-8">
            <SearchBar />
          </div>
        </div>
      </section>

      {/* Categories grid */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <h2 className="text-lg font-semibold text-rf-text-primary mb-6">
          Browse by Category
        </h2>
        {categories.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((cat) => (
              <CategoryCard key={cat.id} category={cat} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-rf-text-muted">
            <p>Documentation is being set up. Check back soon!</p>
          </div>
        )}

        {/* Quick links */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/help-center/tickets"
            className="flex items-center gap-4 p-5 bg-rf-surface-card border border-rf-border rounded-rf-xl hover:border-rf-blue/40 hover:shadow-rf-md transition-all"
          >
            <div className="h-10 w-10 rounded-rf-lg bg-orange-500/10 flex items-center justify-center">
              <LifeBuoy className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-rf-text-primary">
                Submit a Support Ticket
              </h3>
              <p className="text-xs text-rf-text-muted mt-0.5">
                Can&apos;t find what you need? Our team will get back to you.
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-4 p-5 bg-rf-surface-card border border-rf-border rounded-rf-xl">
            <div className="h-10 w-10 rounded-rf-lg bg-rf-blue/10 flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-rf-blue" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-rf-text-primary">
                Chat with AI Assistant
              </h3>
              <p className="text-xs text-rf-text-muted mt-0.5">
                Click the chat bubble in the bottom right for instant help.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Chatbot />
    </>
  );
}
