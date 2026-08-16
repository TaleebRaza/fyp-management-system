export function getSupervisorExportFilename(supervisorName: string) {
  return `fyp-report-${supervisorName.replace(/\s+/g, '-')}.pdf`;
}

export function downloadSupervisorBlob(blob: Blob, filename: string) {
  const downloadUrl = window.URL.createObjectURL(blob);
  const downloadLink = document.createElement('a');

  try {
    downloadLink.href = downloadUrl;
    downloadLink.download = filename;
    document.body.appendChild(downloadLink);
    downloadLink.click();
  } finally {
    window.URL.revokeObjectURL(downloadUrl);
    downloadLink.remove();
  }
}
