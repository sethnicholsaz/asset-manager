import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

interface DispositionData {
  cow_id: string;
  disposition_date: string;
  disposition_type: string;
  sale_amount: number;
  final_book_value: number;
  gain_loss: number;
  notes: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get yesterday's date (since this runs daily for previous day's data)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const targetDate = yesterday.toISOString().split('T')[0];

    console.log(`Generating daily disposition report for ${targetDate}`);

    // Get all companies
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('id, name');

    if (companiesError) {
      throw new Error(`Error fetching companies: ${companiesError.message}`);
    }

    // Process each company
    for (const company of companies || []) {
      console.log(`Processing company: ${company.name} (${company.id})`);

      // Get dispositions for the target date
      const { data: dispositions, error: dispositionsError } = await supabase
        .from('cow_dispositions')
        .select('*')
        .eq('company_id', company.id)
        .eq('disposition_date', targetDate)
        .order('disposition_type', { ascending: true })
        .order('cow_id', { ascending: true });

      if (dispositionsError) {
        console.error(`Error fetching dispositions for company ${company.id}:`, dispositionsError);
        continue;
      }

      if (!dispositions || dispositions.length === 0) {
        console.log(`No dispositions found for company ${company.name} on ${targetDate}`);
        continue;
      }

      // Separate sales and deaths
      const sales = dispositions.filter(d => d.disposition_type === 'sale');
      const deaths = dispositions.filter(d => d.disposition_type === 'death');
      const culled = dispositions.filter(d => d.disposition_type === 'culled');

      // Calculate totals
      const totalSaleAmount = sales.reduce((sum, sale) => sum + (sale.sale_amount || 0), 0);
      const totalSales = sales.length;
      const totalDeaths = deaths.length;
      const totalCulled = culled.length;

      // Generate email content
      const emailContent = generateEmailHTML({
        companyName: company.name,
        date: targetDate,
        sales,
        deaths,
        culled,
        totalSaleAmount,
        totalSales,
        totalDeaths,
        totalCulled
      });

      // Get company admin emails (you may need to adjust this based on your user structure)
      const { data: memberships, error: membershipsError } = await supabase
        .from('company_memberships')
        .select(`
          profiles!inner(email)
        `)
        .eq('company_id', company.id)
        .eq('role', 'owner');

      if (membershipsError) {
        console.error(`Error fetching company admins for ${company.id}:`, membershipsError);
        continue;
      }

      const adminEmails = memberships?.map(m => m.profiles.email).filter(Boolean) || [];

      if (adminEmails.length === 0) {
        console.log(`No admin emails found for company ${company.name}`);
        continue;
      }

      // Send email
      try {
        const emailResponse = await resend.emails.send({
          from: 'Dairy Asset Management <reports@resend.dev>',
          to: adminEmails,
          subject: `Daily Disposition Report - ${company.name} - ${targetDate}`,
          html: emailContent,
        });

        console.log(`Email sent successfully to ${adminEmails.join(', ')} for company ${company.name}:`, emailResponse);
      } catch (emailError) {
        console.error(`Failed to send email for company ${company.name}:`, emailError);
      }
    }

    return new Response(
      JSON.stringify({ 
        message: 'Daily disposition emails processed successfully',
        date: targetDate 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in daily-disposition-email function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

function generateEmailHTML(data: {
  companyName: string;
  date: string;
  sales: DispositionData[];
  deaths: DispositionData[];
  culled: DispositionData[];
  totalSaleAmount: number;
  totalSales: number;
  totalDeaths: number;
  totalCulled: number;
}) {
  const { companyName, date, sales, deaths, culled, totalSaleAmount, totalSales, totalDeaths, totalCulled } = data;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Daily Disposition Report</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .summary { display: flex; gap: 20px; margin-bottom: 30px; }
        .summary-card { background-color: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 15px; flex: 1; text-align: center; }
        .summary-card h3 { margin: 0 0 10px 0; color: #666; font-size: 14px; }
        .summary-card .number { font-size: 24px; font-weight: bold; color: #2563eb; }
        .summary-card .amount { font-size: 18px; color: #059669; }
        .section { margin-bottom: 30px; }
        .section h2 { color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e5e7eb; }
        th { background-color: #f9fafb; font-weight: 600; }
        .amount { text-align: right; font-weight: 600; }
        .gain { color: #059669; }
        .loss { color: #dc2626; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Daily Disposition Report</h1>
          <p><strong>Company:</strong> ${companyName}</p>
          <p><strong>Date:</strong> ${new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        <div class="summary">
          <div class="summary-card">
            <h3>Total Sales</h3>
            <div class="number">${totalSales}</div>
            <div class="amount">$${totalSaleAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          </div>
          <div class="summary-card">
            <h3>Deaths</h3>
            <div class="number">${totalDeaths}</div>
          </div>
          <div class="summary-card">
            <h3>Culled</h3>
            <div class="number">${totalCulled}</div>
          </div>
        </div>

        ${sales.length > 0 ? `
        <div class="section">
          <h2>Sales (${totalSales})</h2>
          <table>
            <thead>
              <tr>
                <th>Cow ID</th>
                <th>Sale Amount</th>
                <th>Book Value</th>
                <th>Gain/Loss</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${sales.map(sale => `
                <tr>
                  <td>${sale.cow_id}</td>
                  <td class="amount">$${(sale.sale_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td class="amount">$${sale.final_book_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td class="amount ${sale.gain_loss >= 0 ? 'gain' : 'loss'}">
                    ${sale.gain_loss >= 0 ? '+' : ''}$${sale.gain_loss.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td>${sale.notes || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        ${deaths.length > 0 ? `
        <div class="section">
          <h2>Deaths (${totalDeaths})</h2>
          <table>
            <thead>
              <tr>
                <th>Cow ID</th>
                <th>Book Value</th>
                <th>Loss</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${deaths.map(death => `
                <tr>
                  <td>${death.cow_id}</td>
                  <td class="amount">$${death.final_book_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td class="amount loss">-$${death.final_book_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td>${death.notes || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        ${culled.length > 0 ? `
        <div class="section">
          <h2>Culled (${totalCulled})</h2>
          <table>
            <thead>
              <tr>
                <th>Cow ID</th>
                <th>Book Value</th>
                <th>Loss</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${culled.map(cow => `
                <tr>
                  <td>${cow.cow_id}</td>
                  <td class="amount">$${cow.final_book_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td class="amount loss">-$${cow.final_book_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td>${cow.notes || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        <div class="footer">
          <p>This is an automated report generated by your Dairy Asset Management system.</p>
          <p>Report generated on ${new Date().toLocaleString('en-US')}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}