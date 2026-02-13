"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function submitApplication(formData: FormData) {
  const supabase = await createClient();

  const companyId = formData.get("companyId") as string;
  const jobId = formData.get("jobId") as string;
  const companySlug = formData.get("companySlug") as string;
  const jobSlug = formData.get("jobSlug") as string;
  const fullName = formData.get("fullName") as string;
  const email = formData.get("email") as string;
  const phone = formData.get("phone") as string;
  const terminalPreference = (formData.get("terminalPreference") as string) || "";
  const experience = formData.get("experience") as string;
  const resumeFile = formData.get("resume") as File | null;

  let resumeUrl: string | null = null;

  // Upload resume to Supabase Storage if provided
  if (resumeFile && resumeFile.size > 0) {
    const fileExt = resumeFile.name.split(".").pop();
    const fileName = `${companyId}/${jobId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("resumes")
      .upload(fileName, resumeFile, {
        contentType: resumeFile.type,
      });

    if (uploadError) {
      console.error("Resume upload error:", uploadError);
      redirect(`/apply/${companySlug}/${jobSlug}?error=upload_failed`);
    }

    resumeUrl = fileName;
  }

  // Insert applicant record
  const { error: insertError } = await supabase.from("applicants").insert({
    company_id: companyId,
    job_id: jobId,
    full_name: fullName,
    email,
    phone,
    terminal_preference: terminalPreference,
    experience,
    resume_url: resumeUrl,
    status: "applied",
  });

  if (insertError) {
    console.error("Applicant insert error:", insertError);
    redirect(`/apply/${companySlug}/${jobSlug}?error=submission_failed`);
  }

  redirect(`/apply/${companySlug}/${jobSlug}/success`);
}
