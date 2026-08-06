export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  try {
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
};

export const downloadTextFile = (content: string, filename: string, mimeType: string) => {
  downloadBlob(new Blob([content], { type: mimeType }), filename);
};
