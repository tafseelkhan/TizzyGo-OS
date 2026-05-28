export const generateUniqOsId = () => {
  const random = Math.random().toString(36).substring(2, 18);
  return `seller_${random}`;
};
