import { Chatbot } from "@/components/help-center/Chatbot";
import { TicketForm } from "@/components/help-center/TicketForm";

export default function SubmitTicketPage() {
  return (
    <>
      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-rf-text-primary">
          Submit a Support Ticket
        </h1>
        <p className="mt-2 text-sm text-rf-text-secondary">
          Can&apos;t find the answer in our docs? Describe your issue and our
          team will get back to you as soon as possible.
        </p>

        <div className="mt-8">
          <TicketForm />
        </div>
      </div>

      <Chatbot />
    </>
  );
}
