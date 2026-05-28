// types/category.ts
export interface Subcategory {
  id: string;
  name: string;
  iconName: string;
  hasCondition: boolean;
}

export interface Category {
  id: string;
  name: string;
  iconName: string;
  subcategories: Subcategory[];
}
