// ✅ General fields for each subcategory
export const fashionSubCategoryFields: Record<
  string,
  { name: string; type: string; placeholder?: string; required?: boolean }[]
> = {
  "Men's Clothing": [
    { name: "brand", type: "text", placeholder: "e.g., Levi's", required: true },
    { name: "fit", type: "text", placeholder: "e.g., Slim Fit", required: true },
    { name: "pattern", type: "text", placeholder: "e.g., Striped", required: true },
    { name: "sleeveType", type: "text", placeholder: "e.g., Full Sleeve", required: true },
    { name: "neckType", type: "text", placeholder: "e.g., Collared", required: true },
    { name: "occasion", type: "text", placeholder: "e.g., Casual", required: true },
    { name: "fabric", type: "text", placeholder: "e.g., Cotton", required: true }
  ],
  "Women's Clothing": [
    { name: "brand", type: "text", placeholder: "e.g., Zara", required: true },
    { name: "fit", type: "text", placeholder: "e.g., Regular", required: true },
    { name: "pattern", type: "text", placeholder: "e.g., Floral", required: true },
    { name: "sleeveType", type: "text", placeholder: "e.g., Sleeveless", required: true },
    { name: "neckType", type: "text", placeholder: "e.g., V-Neck", required: true },
    { name: "occasion", type: "text", placeholder: "e.g., Party", required: true },
    { name: "fabric", type: "text", placeholder: "e.g., Silk", required: true }
  ],
  "Kids Clothing": [
    { name: "brand", type: "text", placeholder: "e.g., H&M Kids", required: true },
    { name: "fit", type: "text", placeholder: "e.g., Regular", required: true },
    { name: "pattern", type: "text", placeholder: "e.g., Cartoon Print", required: true },
    { name: "ageGroup", type: "text", placeholder: "e.g., 5-6 Years", required: true },
    { name: "sleeveType", type: "text", placeholder: "e.g., Half Sleeve", required: true },
    { name: "occasion", type: "text", placeholder: "e.g., Casual", required: true },
    { name: "fabric", type: "text", placeholder: "e.g., Cotton Blend", required: true }
  ],
  "Ethnic Wear": [
    { name: "brand", type: "text", placeholder: "e.g., Manyavar", required: true },
    { name: "style", type: "text", placeholder: "e.g., Anarkali", required: true },
    { name: "embroidery", type: "text", placeholder: "e.g., Zari Work", required: true },
    { name: "workType", type: "text", placeholder: "e.g., Embroidered", required: true },
    { name: "occasion", type: "text", placeholder: "e.g., Wedding", required: true },
    { name: "length", type: "text", placeholder: "e.g., Ankle Length", required: true },
    { name: "fabric", type: "text", placeholder: "e.g., Silk", required: true }
  ],
  "Western Wear": [
    { name: "brand", type: "text", placeholder: "e.g., Mango", required: true },
    { name: "fit", type: "text", placeholder: "e.g., Bodycon", required: true },
    { name: "pattern", type: "text", placeholder: "e.g., Solid", required: true },
    { name: "rise", type: "text", placeholder: "e.g., High Rise", required: true },
    { name: "length", type: "text", placeholder: "e.g., Cropped", required: true },
    { name: "occasion", type: "text", placeholder: "e.g., Casual", required: true },
    { name: "fabric", type: "text", placeholder: "e.g., Denim", required: true }
  ],
  "Footwear": [
    { name: "brand", type: "text", placeholder: "e.g., Nike", required: true },
    { name: "soleMaterial", type: "text", placeholder: "e.g., Rubber", required: true },
    { name: "closureType", type: "text", placeholder: "e.g., Lace-up", required: true },
    { name: "heelType", type: "text", placeholder: "e.g., Flat", required: true },
    { name: "toeShape", type: "text", placeholder: "e.g., Round", required: true },
    { name: "occasion", type: "text", placeholder: "e.g., Sports", required: true },
    { name: "material", type: "text", placeholder: "e.g., Leather", required: true }
  ],
  "Watches": [
    { name: "brand", type: "text", placeholder: "e.g., Titan", required: true },
    { name: "movement", type: "text", placeholder: "e.g., Quartz", required: true },
    { name: "waterResistance", type: "text", placeholder: "e.g., 50m", required: true },
    { name: "displayType", type: "text", placeholder: "e.g., Analog", required: true },
    { name: "bandMaterial", type: "text", placeholder: "e.g., Metal", required: true },
    { name: "dialColor", type: "text", placeholder: "e.g., Black", required: true },
    { name: "feature", type: "text", placeholder: "e.g., Chronograph", required: true }
  ],
  "Jewelry": [
    { name: "brand", type: "text", placeholder: "e.g., Tanishq", required: true },
    { name: "type", type: "text", placeholder: "e.g., Necklace", required: true },
    { name: "material", type: "text", placeholder: "e.g., Gold", required: true },
    { name: "purity", type: "text", placeholder: "e.g., 22K", required: true },
    { name: "stoneType", type: "text", placeholder: "e.g., Diamond", required: true },
    { name: "occasion", type: "text", placeholder: "e.g., Wedding", required: true },
    { name: "weight", type: "text", placeholder: "e.g., 10g", required: true }
  ],
  "Handbags": [
    { name: "brand", type: "text", placeholder: "e.g., H&M", required: true },
    { name: "type", type: "text", placeholder: "e.g., Tote", required: true },
    { name: "closure", type: "text", placeholder: "e.g., Zipper", required: true },
    { name: "strapType", type: "text", placeholder: "e.g., Shoulder Strap", required: true },
    { name: "compartment", type: "text", placeholder: "e.g., Multiple", required: true },
    { name: "occasion", type: "text", placeholder: "e.g., Casual", required: true },
    { name: "material", type: "text", placeholder: "e.g., Faux Leather", required: true }
  ],
  "Sunglasses": [
    { name: "brand", type: "text", placeholder: "e.g., Ray-Ban", required: true },
    { name: "lensType", type: "text", placeholder: "e.g., Polarized", required: true },
    { name: "frameMaterial", type: "text", placeholder: "e.g., Metal", required: true },
    { name: "frameShape", type: "text", placeholder: "e.g., Aviator", required: true },
    { name: "lensColor", type: "text", placeholder: "e.g., Black", required: true },
    { name: "protection", type: "text", placeholder: "e.g., UV400", required: true },
    { name: "feature", type: "text", placeholder: "e.g., Anti-Glare", required: true }
  ],
  "Wallets": [
    { name: "brand", type: "text", placeholder: "e.g., Tommy Hilfiger", required: true },
    { name: "type", type: "text", placeholder: "e.g., Bi-fold", required: true },
    { name: "material", type: "text", placeholder: "e.g., Leather", required: true },
    { name: "compartment", type: "text", placeholder: "e.g., Multiple Card Slots", required: true },
    { name: "closure", type: "text", placeholder: "e.g., Button", required: true },
    { name: "color", type: "text", placeholder: "e.g., Brown", required: true },
    { name: "feature", type: "text", placeholder: "e.g., RFID Protection", required: true }
  ],
  "Belts": [
    { name: "brand", type: "text", placeholder: "e.g., Gucci", required: true },
    { name: "buckleType", type: "text", placeholder: "e.g., Pin Buckle", required: true },
    { name: "material", type: "text", placeholder: "e.g., Leather", required: true },
    { name: "width", type: "text", placeholder: "e.g., 3.5 cm", required: true },
    { name: "color", type: "text", placeholder: "e.g., Black", required: true },
    { name: "occasion", type: "text", placeholder: "e.g., Formal", required: true },
    { name: "feature", type: "text", placeholder: "e.g., Reversible", required: true }
  ],
  "Winter Wear": [
    { name: "brand", type: "text", placeholder: "e.g., Puma", required: true },
    { name: "insulation", type: "text", placeholder: "e.g., Wool", required: true },
    { name: "style", type: "text", placeholder: "e.g., Parka", required: true },
    { name: "hoodType", type: "text", placeholder: "e.g., Detachable", required: true },
    { name: "closure", type: "text", placeholder: "e.g., Zipper", required: true },
    { name: "pocketType", type: "text", placeholder: "e.g., Multiple Pockets", required: true },
    { name: "material", type: "text", placeholder: "e.g., Polyester", required: true }
  ],
  "Luggage": [
    { name: "brand", type: "text", placeholder: "e.g., American Tourister", required: true },
    { name: "type", type: "text", placeholder: "e.g., Suitcase", required: true },
    { name: "wheelType", type: "text", placeholder: "e.g., Spinner", required: true },
    { name: "material", type: "text", placeholder: "e.g., Polycarbonate", required: true },
    { name: "capacity", type: "text", placeholder: "e.g., 65L", required: true },
    { name: "closure", type: "text", placeholder: "e.g., Zipper", required: true },
    { name: "feature", type: "text", placeholder: "e.g., TSA Lock", required: true }
  ],
  "Caps & Hats": [
    { name: "brand", type: "text", placeholder: "e.g., Adidas", required: true },
    { name: "style", type: "text", placeholder: "e.g., Baseball Cap", required: true },
    { name: "material", type: "text", placeholder: "e.g., Cotton", required: true },
    { name: "closure", type: "text", placeholder: "e.g., Adjustable Strap", required: true },
    { name: "brimType", type: "text", placeholder: "e.g., Curved", required: true },
    { name: "occasion", type: "text", placeholder: "e.g., Casual", required: true },
    { name: "feature", type: "text", placeholder: "e.g., UV Protection", required: true }
  ],
  "Scarves & Stoles": [
    { name: "brand", type: "text", placeholder: "e.g., Vero Moda", required: true },
    { name: "pattern", type: "text", placeholder: "e.g., Printed", required: true },
    { name: "material", type: "text", placeholder: "e.g., Silk", required: true },
    { name: "length", type: "text", placeholder: "e.g., Long", required: true },
    { name: "width", type: "text", placeholder: "e.g., 30 inches", required: true },
    { name: "occasion", type: "text", placeholder: "e.g., Formal", required: true },
    { name: "feature", type: "text", placeholder: "e.g., Lightweight", required: true }
  ],
  "Gloves & Mittens": [
    { name: "brand", type: "text", placeholder: "e.g., North Face", required: true },
    { name: "type", type: "text", placeholder: "e.g., Touchscreen", required: true },
    { name: "material", type: "text", placeholder: "e.g., Wool", required: true },
    { name: "lining", type: "text", placeholder: "e.g., Fleece", required: true },
    { name: "closure", type: "text", placeholder: "e.g., Elastic Cuff", required: true },
    { name: "size", type: "text", placeholder: "e.g., Medium", required: true },
    { name: "feature", type: "text", placeholder: "e.g., Water Resistant", required: true }
  ],
  "Socks & Hosiery": [
    { name: "brand", type: "text", placeholder: "e.g., Puma", required: true },
    { name: "type", type: "text", placeholder: "e.g., Ankle Socks", required: true },
    { name: "material", type: "text", placeholder: "e.g., Cotton Blend", required: true },
    { name: "length", type: "text", placeholder: "e.g., Ankle Length", required: true },
    { name: "size", type: "text", placeholder: "e.g., 9-11", required: true },
    { name: "pattern", type: "text", placeholder: "e.g., Striped", required: true },
    { name: "feature", type: "text", placeholder: "e.g., Cushioned Sole", required: true }
  ],
  "Activewear / Sportswear": [
    { name: "brand", type: "text", placeholder: "e.g., Nike", required: true },
    { name: "fit", type: "text", placeholder: "e.g., Compression", required: true },
    { name: "feature", type: "text", placeholder: "e.g., Moisture-Wicking", required: true },
    { name: "activity", type: "text", placeholder: "e.g., Running", required: true },
    { name: "closure", type: "text", placeholder: "e.g., Elastic Waist", required: true },
    { name: "material", type: "text", placeholder: "e.g., Polyester", required: true },
    { name: "feature2", type: "text", placeholder: "e.g., Breathable", required: true }
  ],
  "Innerwear / Lingerie": [
    { name: "brand", type: "text", placeholder: "e.g., Jockey", required: true },
    { name: "type", type: "text", placeholder: "e.g., Bra", required: true },
    { name: "material", type: "text", placeholder: "e.g., Cotton", required: true },
    { name: "cupSize", type: "text", placeholder: "e.g., B", required: true },
    { name: "strapType", type: "text", placeholder: "e.g., Adjustable", required: true },
    { name: "closure", type: "text", placeholder: "e.g., Hook & Eye", required: true },
    { name: "feature", type: "text", placeholder: "e.g., Padded", required: true }
  ],
  "Swimwear": [
    { name: "brand", type: "text", placeholder: "e.g., Speedo", required: true },
    { name: "style", type: "text", placeholder: "e.g., One-Piece", required: true },
    { name: "material", type: "text", placeholder: "e.g., Nylon", required: true },
    { name: "lining", type: "text", placeholder: "e.g., Mesh", required: true },
    { name: "closure", type: "text", placeholder: "e.g., Tie Back", required: true },
    { name: "feature", type: "text", placeholder: "e.g., Chlorine Resistant", required: true },
    { name: "coverage", type: "text", placeholder: "e.g., Moderate", required: true }
  ],
  "Ethical / Sustainable Fashion": [
    { name: "brand", type: "text", placeholder: "e.g., No Nasties", required: true },
    { name: "certification", type: "text", placeholder: "e.g., Organic Cotton", required: true },
    { name: "feature", type: "text", placeholder: "e.g., Eco-Friendly Dye", required: true },
    { name: "materialSource", type: "text", placeholder: "e.g., Recycled", required: true },
    { name: "production", type: "text", placeholder: "e.g., Handmade", required: true },
    { name: "packaging", type: "text", placeholder: "e.g., Biodegradable", required: true },
    { name: "fairTrade", type: "text", placeholder: "e.g., Yes", required: true }
  ],
  "Accessories": [
    { name: "brand", type: "text", placeholder: "e.g., H&M", required: true },
    { name: "type", type: "text", placeholder: "e.g., Belt", required: true },
    { name: "style", type: "text", placeholder: "e.g., Casual", required: true },
    { name: "material", type: "text", placeholder: "e.g., Leather", required: true },
    { name: "color", type: "text", placeholder: "e.g., Brown", required: true },
    { name: "occasion", type: "text", placeholder: "e.g., Formal", required: true },
    { name: "feature", type: "text", placeholder: "e.g., Adjustable", required: true }
  ],
  "Costumes / Party Wear": [
    { name: "brand", type: "text", placeholder: "e.g., Disney", required: true },
    { name: "theme", type: "text", placeholder: "e.g., Superhero", required: true },
    { name: "material", type: "text", placeholder: "e.g., Polyester", required: true },
    { name: "size", type: "text", placeholder: "e.g., Medium", required: true },
    { name: "ageGroup", type: "text", placeholder: "e.g., Adult", required: true },
    { name: "occasion", type: "text", placeholder: "e.g., Halloween", required: true },
    { name: "accessoriesIncluded", type: "text", placeholder: "e.g., Mask", required: true }
  ],
};

// ✅ Extra config: image-level attributes for each subcategory
export const fashionSubCategoryImageAttributes: Record<
  string,
  { name: string; type: string; placeholder?: string; required?: boolean }[]
> = {
  "Men's Clothing": [
    { name: "color", type: "text", placeholder: "e.g., Blue", required: true },
    { name: "size", type: "text", placeholder: "e.g., L", required: true },
    { name: "age", type: "text", placeholder: "e.g., 14-16 Years", required: true },
    { name: "material", type: "text", placeholder: "e.g., Cotton" },
    { name: "patternDetail", type: "text", placeholder: "e.g., Vertical Stripes" },
  ],
  "Women's Clothing": [
    { name: "color", type: "text", placeholder: "e.g., Red", required: true },
    { name: "size", type: "text", placeholder: "e.g., M", required: true },
    { name: "age", type: "text", placeholder: "e.g., 14-16 Years", required: true },
    { name: "material", type: "text", placeholder: "e.g., Silk" },
    { name: "embroideryDetail", type: "text", placeholder: "e.g., Floral Embroidery" },
  ],
  "Kids Clothing": [
    { name: "color", type: "text", placeholder: "e.g., Yellow" },
    { name: "size", type: "text", placeholder: "e.g., 6-8Y" },
    { name: "age", type: "text", placeholder: "e.g., 14-16 Years", required: true },
    { name: "material", type: "text", placeholder: "e.g., Cotton Blend" },
    { name: "character", type: "text", placeholder: "e.g., Spider-Man Print" },
  ],
  "Footwear": [
    { name: "color", type: "text", placeholder: "e.g., Black" },
    { name: "size", type: "text", placeholder: "e.g., 9" },
    { name: "age", type: "text", placeholder: "e.g., 14-16 Years", required: true },
    { name: "soleMaterial", type: "text", placeholder: "e.g., Rubber" },
    { name: "innerMaterial", type: "text", placeholder: "e.g., Cushioned Insole" },
  ],
  "Watches": [
    { name: "color", type: "text", placeholder: "e.g., Silver" },
    { name: "strapMaterial", type: "text", placeholder: "e.g., Leather" },
    { name: "dialShape", type: "text", placeholder: "e.g., Round" },
    { name: "dialColor", type: "text", placeholder: "e.g., Black" },
  ],
  "Jewelry": [
    { name: "material", type: "text", placeholder: "e.g., Gold" },
    { name: "stoneType", type: "text", placeholder: "e.g., Diamond" },
    { name: "weight", type: "text", placeholder: "e.g., 10g" },
    { name: "stoneColor", type: "text", placeholder: "e.g., White" },
  ],
  "Handbags": [
    { name: "color", type: "text", placeholder: "e.g., Brown" },
    { name: "material", type: "text", placeholder: "e.g., Leather" },
    { name: "hardwareColor", type: "text", placeholder: "e.g., Gold" },
    { name: "liningMaterial", type: "text", placeholder: "e.g., Polyester" },
  ],
  "Sunglasses": [
    { name: "frameColor", type: "text", placeholder: "e.g., Black" },
    { name: "lensColor", type: "text", placeholder: "e.g., Brown" },
    { name: "templeLength", type: "text", placeholder: "e.g., 140mm" },
    { name: "bridgeWidth", type: "text", placeholder: "e.g., 18mm" },
  ],
  "Winter Wear": [
    { name: "color", type: "text", placeholder: "e.g., Navy Blue" },
    { name: "size", type: "text", placeholder: "e.g., XL" },
    { name: "liningMaterial", type: "text", placeholder: "e.g., Fleece" },
    { name: "fillPower", type: "text", placeholder: "e.g., 600 Fill" },
  ],
};