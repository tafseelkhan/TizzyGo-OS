// Generate Product ID like PRO-XXXXXXXX-XX-XXXXXXXXX
export const generateProductId = (): string => {
  const part1 = Math.random().toString(36).substring(2, 10).toUpperCase(); // 8 chars
  const part2 = Math.random().toString(36).substring(2, 4).toUpperCase();  // 2 chars
  const part3 = Math.random().toString(36).substring(2, 11).toUpperCase(); // 9 chars
  return `PRO-${part1}-${part2}-${part3}`;
};
