import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  company_id: string;
  recipient_email: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { company_id, recipient_email }: EmailRequest = await req.json();

    // Get cows needing attention
    const { data: stagingRecords, error } = await supabase
      .from("master_file_staging")
      .select("*")
      .eq("company_id", company_id)
      .eq("action_taken", "pending")
      .order("verification_date", { ascending: false });

    if (error) {
      console.error("Error fetching staging records:", error);
      throw error;
    }

    if (!stagingRecords || stagingRecords.length === 0) {
      return new Response(
        JSON.stringify({ message: "No cows need attention" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Get company name
    const { data: company } = await supabase
      .from("companies")
      .select("name")
      .eq("id", company_id)
      .single();

    const companyName = company?.name || "Your Company";

    // Group records by discrepancy type
    const groupedRecords = stagingRecords.reduce((acc, record) => {
      const type = record.discrepancy_type;
      if (!acc[type]) acc[type] = [];
      acc[type].push(record);
      return acc;
    }, {} as Record<string, any[]>);

    // Create email content
    let emailContent = `
      <h2>Cows Requiring Attention - ${companyName}</h2>
      <p>You have ${stagingRecords.length} cow(s) that require attention:</p>
    `;

    Object.entries(groupedRecords).forEach(([type, records]) => {
      const typeTitle = type === "missing_from_master" ? "Missing from Master File" :
                       type === "needs_disposal" ? "Needs Disposal" :
                       type === "missing_freshen_date" ? "Missing Freshen Date" : type;
      
      emailContent += `
        <h3>${typeTitle} (${records.length})</h3>
        <ul>
      `;
      
      records.forEach(record => {
        emailContent += `<li>Tag: ${record.tag_number} - Birth Date: ${record.birth_date}</li>`;
      });
      
      emailContent += `</ul>`;
    });

    emailContent += `
      <p>Please log into the system to review and take action on these cows.</p>
      <p><strong>Note:</strong> This email was generated automatically based on your master file verification.</p>
    `;

    // Send email
    const emailResponse = await resend.emails.send({
      from: "Cow Management System <onboarding@resend.dev>",
      to: [recipient_email],
      subject: `${stagingRecords.length} Cow(s) Need Attention - ${companyName}`,
      html: emailContent,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ 
        message: "Email sent successfully", 
        cows_count: stagingRecords.length,
        email_id: emailResponse.data?.id 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error("Error in cows-attention-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);