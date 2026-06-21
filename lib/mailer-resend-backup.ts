// import { Resend } from 'resend';

// // Initialize the Resend client with the environment variable
// const resend = new Resend(process.env.RESEND_API_KEY);

// export const sendNotificationEmail = async (to: string, subject: string, htmlContent: string) => {
//   if (!process.env.RESEND_API_KEY) {
//     console.warn("⚠️ RESEND_API_KEY missing in .env.local. Email dispatch aborted.");
//     return false;
//   }

//   try {
//     const { data, error } = await resend.emails.send({
//       // IMPORTANT: Change this to your verified custom domain when you activate this file
//       from: 'FYP Portal <updates@your-fyp-portal.com>', 
//       to: [to],
//       subject: subject,
//       html: htmlContent,
//     });

//     if (error) {
//       console.error("❌ Resend API Error:", error.message);
//       return false;
//     }
    
//     console.log("✅ Email sent successfully via Resend. ID:", data?.id);
//     return true;
//   } catch (error: any) {
//     console.error("❌ Critical error dispatching email via Resend:", error.message);
//     return false;
//   }
// };

// /* =============================================================================
// EMERGENCY SWAP INSTRUCTIONS:
// If your university SMTP email gets blocked or starts landing in spam:
// 1. Buy a domain or get a free one via GitHub Student Developer Pack.
// 2. Sign up for Resend (resend.com), add your domain, and verify DNS records.
// 3. Add RESEND_API_KEY to your Vercel Environment Variables.
// 4. Delete `lib/mailer.ts`.
// 5. Rename this file from `mailer-resend-backup.ts` to `mailer.ts`.
// 6. Push to GitHub. Your portal will instantly switch to enterprise-grade email.
// =============================================================================
// */