type ProjectSubmissionEmailInput = {
  studentName: string;
  domainText: string;
  title: string;
};

export function buildProjectSubmissionEmail({
  studentName,
  domainText,
  title,
}: ProjectSubmissionEmailInput) {
  return {
    subject: `New FYP Project Submitted: ${studentName}`,
    html: `
      <div style="background-color: #f4f4f5; padding: 40px 20px; font-family: sans-serif;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e4e4e7;">
          <div style="background-color: #18181b; padding: 24px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 20px;">FYP Portal Notification</h1>
          </div>
          <div style="padding: 32px;">
            <h2 style="margin-top: 0; color: #18181b; font-size: 24px;">New Project Submission</h2>
            <p style="color: #71717a; margin-bottom: 24px;">A new Final Year Project proposal has been submitted.</p>
            <div style="background-color: #f4f4f5; border-radius: 12px; padding: 20px; margin-bottom: 32px;">
              <p style="margin: 0 0 12px 0;"><strong>Submitted By:</strong> ${studentName}</p>
              <p style="margin: 0 0 12px 0;"><strong>Domains:</strong> ${domainText}</p>
              <p style="margin: 0;"><strong>Title:</strong> ${title}</p>
            </div>
          </div>
        </div>
      </div>
    `,
  };
}

type ProjectStatusEmailInput = {
  supervisorName: string;
  status: string;
  notificationMessage: string;
  remarks: string;
  stageAdvanced: boolean;
};

export function buildProjectStatusEmail({
  supervisorName,
  status,
  notificationMessage,
  remarks,
  stageAdvanced,
}: ProjectStatusEmailInput) {
  const primaryColor = status === 'Approved' ? '#10b981' : status === 'Changes Requested' ? '#f59e0b' : '#ef4444';
  const bgColor = status === 'Approved' ? '#ecfdf5' : status === 'Changes Requested' ? '#fffbeb' : '#fef2f2';

  return {
    subject: `FYP Project Update: ${stageAdvanced ? 'Stage Advanced!' : status}`,
    html: `
      <div style="background-color: #f4f4f5; padding: 40px 20px; font-family: sans-serif;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e4e4e7;">
          <div style="background-color: #18181b; padding: 24px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 20px;">FYP Portal Notification</h1>
          </div>
          <div style="padding: 32px;">
            <h2 style="margin-top: 0; color: #18181b; font-size: 24px;">Project Updated</h2>
            <p style="color: #71717a; margin-bottom: 24px;">Your supervisor, <strong>${supervisorName}</strong>, has reviewed your submission.</p>
            <div style="text-align: center; margin-bottom: 24px;">
              <span style="display: inline-block; background-color: ${bgColor}; color: ${primaryColor}; padding: 8px 16px; border-radius: 999px; font-weight: bold;">
                ${notificationMessage}
              </span>
            </div>
            <div style="background-color: #f8fafc; border-left: 4px solid ${primaryColor}; padding: 20px;">
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #94a3b8; font-weight: bold; text-transform: uppercase;">Supervisor Remarks</p>
              <p style="margin: 0; font-size: 15px; color: #334155; font-style: italic;">"${remarks || 'Proceed to the next stage.'}"</p>
            </div>
          </div>
        </div>
      </div>
    `,
  };
}
