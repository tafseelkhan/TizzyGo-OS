import sharp from 'sharp';

export const detectBlur = async (base64Image: string): Promise<boolean> => {
  try {
    const buffer = Buffer.from(base64Image, 'base64');
    const image = sharp(buffer);
    const metadata = await image.metadata();

    // Logic: very small images or low dimensions = likely blurry
    if ((metadata.width ?? 0) < 300 || (metadata.height ?? 0) < 300) {
      return true;
    }

    return false;
  } catch (error) {
    console.error('Blur detection failed:', error);
    return true; // If it fails, mark as blurry
  }
};

export const detectCategory = (filename: string): string => {
  const lower = filename.toLowerCase();

  if (lower.includes('shirt') || lower.includes('jeans')) return 'Clothing';
  if (lower.includes('phone') || lower.includes('laptop')) return 'Electronics';
  if (lower.includes('book')) return 'Books';

  return 'Others';
};

export const generateTitleAndPrice = (filename: string): { title: string; price: number } => {
  const clean = filename.replace(/[-_]/g, ' ').replace(/\.\w+$/, '');
  const title = clean.charAt(0).toUpperCase() + clean.slice(1);
  const price = Math.floor(50 + Math.random() * 500); // Random price
  return { title, price };
};
