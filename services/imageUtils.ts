
export const fileToBase64 = (file: File): Promise<{ data: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const split = result.split(',');
      const data = split[1];
      const mimeType = split[0].match(/:(.*?);/)?.[1] || 'image/png';
      resolve({ data, mimeType });
    };
    reader.onerror = (error) => reject(error);
  });
};

export const cleanFilename = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .substring(0, 30)
    .replace(/_+/g, '_');
};
