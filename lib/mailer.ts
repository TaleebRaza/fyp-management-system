import nodemailer from 'nodemailer';

// Create a reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

export const sendNotificationEmail = async (to: string, subject: string, htmlContent: string) => {
  // Fail gracefully if environment variables are not configured
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    console.warn("⚠️ Email credentials missing in .env.local. Email dispatch aborted.");
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from: `"FYP Portal Notification" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html: htmlContent,
    });
    
    console.log("✅ Email sent successfully:", info.messageId);
    return true;
  } catch (error) {
    console.error("❌ Error sending email:", error);
    return false;
  }
};