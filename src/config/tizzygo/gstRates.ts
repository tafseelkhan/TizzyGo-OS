// config/gstRates.ts

export interface GstRateConfig {
  category: string;
  subcategories: {
    [key: string]: number; // subcategory name -> GST rate (%)
  };
  defaultRate: number;
}

// Complete GST Rates Mapping as per Indian Tax System
export const GST_RATES: GstRateConfig[] = [
  // ======================== ELECTRONICS ========================
  {
    category: "Electronics",
    subcategories: {
      Mobiles: 18, // Mobile phones @18% [citation:2][citation:4][citation:10]
      Laptops: 18, // Laptops @18% [citation:2][citation:10]
      Smartwatches: 18, // Wearables @18%
      Tablets: 18, // Tablets @18% [citation:10]
      Cameras: 18, // Digital cameras @18% [citation:2][citation:4][citation:10]
      Drones: 18, // Drones @18%
      Headphones: 18, // Headphones/earphones @18% [citation:10]
      "Bluetooth Speakers": 18, // Speakers @18% [citation:10]
      "Gaming Console": 18, // Gaming consoles @18%
      Printers: 18, // Printers @18% [citation:2][citation:10]
      "Computer Components": 18, // PC components @18% [citation:10]
      "Power Banks": 18, // Power banks @18%
      "Smart Home Devices": 18, // Smart devices @18%
      "Wearable Accessories": 18, // Wearable accessories @18%
      "Chargers & Adapters": 18, // Chargers @18%
      Cables: 18, // Wires & cables @18% [citation:10]
      "Memory Cards": 18, // Storage devices @18%
      "USB Drives": 18, // USB drives @18%
      "Laptop Bags & Sleeves": 18, // Laptop accessories @18%
      "Screen Guards": 18, // Mobile accessories @18%
      Webcams: 18, // Webcams @18%
      Routers: 18, // Networking equipment @18% [citation:10]
      "SSD Drives": 18, // SSDs @18%
      "External Hard Drives": 18, // External storage @18%
      Monitors: 18, // Monitors @18% (reduced from 28%) [citation:2][citation:6][citation:10]
      Keyboards: 18, // Keyboards @18%
      Mice: 18, // Computer mice @18%
      "Speakers (Computer)": 18, // Computer speakers @18%
      Scanners: 18, // Scanners @18%
      Projectors: 18, // Projectors @18% (reduced from 28%) [citation:2][citation:6]
    },
    defaultRate: 18,
  },
  // ======================== FASHION ========================
  {
    category: "Fashion",
    subcategories: {
      "Men Clothing": 12, // Readymade garments above ₹1,000 @12% [citation:3][citation:7]
      "Women Clothing": 12, // Readymade garments above ₹1,000 @12% [citation:3][citation:7]
      "Kids Clothing": 12, // Kids apparel above ₹1,000 @12%
      Footwear: 12, // Footwear below ₹15,000 @12% [citation:3]
      Watches: 18, // Wrist watches @18% [citation:4]
      Bags: 18, // Leather/synthetic bags @18% [citation:3]
      Jewelry: 18, // Fashion jewelry @18%
      Sunglasses: 18, // Sunglasses @18%
      "Winter Wear": 12, // Winter garments @12%
      "Ethnic Wear": 12, // Ethnic wear above ₹1,000 @12%
      "Lingerie & Sleepwear": 12, // Innerwear @12%
      "Sports Wear": 12, // Activewear @12%
      "Belts & Suspenders": 18, // Leather belts @18% [citation:3]
      "Hats & Caps": 12, // Caps @12%
      "Scarves & Stoles": 12, // Scarves @12%
      Socks: 5, // Cotton socks (basic) @5% [citation:3]
      "Ties & Bow Ties": 18, // Formal accessories @18%
      "Gloves & Mittens": 12, // Gloves @12%
      "Leather Goods": 18, // Leather wallets, goods @18% [citation:3]
      "Sarongs & Pareos": 12, // Beachwear @12%
      "Uniforms & Workwear": 12, // Workwear @12%
      "Tech Wearables (Smart Ring)": 18, // Smart accessories @18%
      "Metallic Accessories": 18, // Metal accessories @18%
      "Fashion Belts": 18, // Fashion belts @18%
      "Leather Wallets": 18, // Leather wallets @18% [citation:3]
      "Travel Wallets": 18, // Travel wallets @18%
      "Lanyards & ID Holders": 18, // Lanyards @18%
    },
    defaultRate: 12,
  },
  // ======================== HOME & KITCHEN ========================
  {
    category: "Home & Kitchen",
    subcategories: {
      Furniture: 18, // Wood/metal furniture @18% [citation:8]
      "Home Decor": 18, // Decor items @18%
      "Kitchen Appliances": 18, // Kitchen appliances @18% [citation:6]
      Lighting: 18, // Lamps & lighting fixtures @18% [citation:8]
      Bedding: 18, // Mattresses, bedding @18% (increased from 12%) [citation:8]
      Cookware: 18, // Cookware @18%
      "Storage & Organizers": 18, // Storage items @18%
      "Tools & Hardware": 18, // Tools @18%
      "Cleaning Supplies": 18, // Cleaning products @18%
      "Bathroom Accessories": 18, // Bath fittings @18%
      "Curtains & Blinds": 18, // Curtains @18%
      "Rugs & Carpets": 18, // Carpets @18%
      "Pooja & Religious Items": 18, // Religious items @18%
      "Garden & Outdoor": 18, // Outdoor furniture @18%
      "Pet Supplies (Home)": 18, // Pet accessories @18%
      "Kitchen Tools & Gadgets": 18, // Kitchen gadgets @18%
      "Dining & Serving": 18, // Dinnerware @18%
      "Glassware & Barware": 18, // Glassware @18%
      "Cushions & Covers": 18, // Cushions @18%
      "Wall Art": 18, // Wall decor @18%
      Clocks: 18, // Clocks @18% [citation:4]
      Mirrors: 18, // Mirrors @18%
    },
    defaultRate: 18,
  },
  // ======================== APPLIANCES ========================
  {
    category: "Appliances",
    subcategories: {
      Refrigerators: 18, // Refrigerators @18% (reduced from 28%) [citation:2][citation:6][citation:10]
      "Washing Machines": 18, // Washing machines @18% (reduced from 28%) [citation:2][citation:6][citation:10]
      "Air Conditioners": 18, // ACs @18% (reduced from 28%) [citation:2][citation:6][citation:10]
      Microwaves: 18, // Microwave ovens @18% [citation:6][citation:10]
      "Water Purifiers": 18, // Water purifiers @18% [citation:6][citation:10]
      "Vacuum Cleaners": 18, // Vacuum cleaners @18% [citation:6][citation:10]
      Geysers: 18, // Water heaters @18% [citation:10]
      "Kitchen Chimneys": 18, // Chimneys @18%
      "Air Coolers": 18, // Air coolers @18%
      Irons: 18, // Electric irons @18% [citation:6][citation:10]
      "Air Fryers": 18, // Air fryers @18%
      "Exhaust Fans": 18, // Exhaust fans @18%
      Dishwashers: 18, // Dishwashers @18% (reduced from 28%) [citation:2][citation:6][citation:10]
      "Sewing Machines": 5, // Sewing machines @5% [citation:1]
    },
    defaultRate: 18,
  },
  // ======================== SPORTS & FITNESS ========================
  {
    category: "Sports & Fitness",
    subcategories: {
      "Exercise Equipment": 18, // Gym equipment @18%
      "Dumbbells & Weights": 18, // Weights @18%
      "Yoga & Pilates": 18, // Yoga mats @18%
      "Cardio Machines": 18, // Treadmills @18%
      "Resistance Bands": 18, // Bands @18%
      "Fitness Trackers & Wearables": 18, // Trackers @18%
      "Gym Accessories": 18, // Accessories @18%
      "Team Sports": 18, // Sports equipment @18%
      "Outdoor Sports": 18, // Outdoor gear @18%
      "Water Sports": 18, // Water sports @18%
      "Winter Sports": 18, // Winter sports @18%
      "Combat Sports": 18, // Boxing/MMA @18%
      "Fitness Apparel": 12, // Activewear @12%
      Footwear: 12, // Sports shoes @12%
      "Hydration & Nutrition": 18, // Shakers etc @18%
      "Recovery & Therapy": 18, // Massagers @18%
      "Jump Ropes": 18, // Jump ropes @18%
      "Agility & Speed Training": 18, // Training aids @18%
      Climbing: 18, // Climbing gear @18%
      Gymnastics: 18, // Gymnastics @18%
      "Boxing & MMA": 18, // Boxing gear @18%
      "Skateboarding & Scooters": 18, // Skateboards @18%
      "Cycling Accessories": 18, // Cycle accessories @18%
      Trampolines: 18, // Trampolines @18%
      "Balance & Stability Trainers": 18, // Trainers @18%
      Kettlebells: 18, // Kettlebells @18%
      "Medicine Balls": 18, // Medicine balls @18%
      "Foam Rollers & Massage Balls": 18, // Recovery @18%
      "Pull Up Bars & Dip Stands": 18, // Bars @18%
      "Speed & Parachute Trainers": 18, // Speed training @18%
      "Stretching & Flexibility": 18, // Straps @18%
      "Fitness Mirrors & Smart Gyms": 18, // Smart gyms @18%
      "Shaker Bottles & Supplement Storage": 18, // Bottles @18%
      "Sports Bags & Gym Bags": 18, // Gym bags @18%
      "Wrist Straps & Lifting Belts": 18, // Lifting belts @18%
      "Indoor Sports (Table Tennis, Badminton)": 18, // Indoor sports @18%
      "Dance & Aerobics": 18, // Dance equipment @18%
      "Electrostimulation (EMS)": 18, // EMS devices @18%
    },
    defaultRate: 18,
  },
  // ======================== BEAUTY & HEALTH ========================
  {
    category: "Beauty & Health",
    subcategories: {
      Skincare: 18, // Skincare products @18%
      "Hair Care": 18, // Hair care @18% [citation:4]
      Makeup: 18, // Cosmetics @18%
      Fragrance: 18, // Perfumes @18% [citation:4]
      "Personal Care": 18, // Personal care @18%
      "Oral Care": 18, // Oral care @18%
      "Bath & Body": 18, // Bath products @18%
      "Men's Grooming": 18, // Grooming @18%
      "Personal Hygiene": 18, // Hygiene products @18%
      "Health & Wellness": 18, // Supplements @18%
      "Personal Medical Devices": 12, // Medical devices @12%
      "Baby Care": 18, // Baby care @18%
      "Foot Care": 18, // Foot care @18%
      "Sun Care": 18, // Sunscreen @18%
      "Lip Care": 18, // Lip products @18%
      "Nail Care": 18, // Nail products @18%
      "Eye Care": 18, // Eye care @18%
      "Tattoo Care": 18, // Tattoo products @18%
      "Adult Care": 18, // Adult care @18%
      "Clean Beauty": 18, // Clean beauty @18%
      "Hair Dryers": 18, // Hair dryers @18% [citation:6][citation:10]
      "Hair Straighteners & Curlers": 18, // Styling tools @18%
      "Trimmers & Grooming Kits": 18, // Trimmers @18%
      "Epilators & Hair Removal Devices": 18, // Epilators @18%
      Massagers: 18, // Massagers @18%
      "Facial Cleansing Brushes": 18, // Cleansing brushes @18%
      "Weighing Scales (Body)": 18, // Body scales @18%
      "Therapy Lights (SAD Lamps)": 18, // Therapy lamps @18%
      "Hot & Cold Therapy Packs (Electric)": 18, // Therapy packs @18%
      "Electric Toothbrushes": 18, // Electric toothbrushes @18%
      "Hair Removal Rollers (Electric)": 18, // Hair removal @18%
    },
    defaultRate: 18,
  },
  // ======================== BABY & KIDS ========================
  {
    category: "Baby & Kids",
    subcategories: {
      "Diapers & Wipes": 18, // Diapers @18%
      "Baby Clothing (0-24M)": 5, // Baby garments (essential) @5%
      "Kids Clothing (2-14Y)": 5, // Kids garments @5% (basic)
      "Baby Gear & Equipment": 18, // Strollers etc @18%
      "Feeding & Nursing": 18, // Feeding bottles @18%
      "Baby Safety & Childproofing": 18, // Safety items @18%
      "Baby Bath & Skincare": 18, // Baby toiletries @18%
      "Nursery & Bedding": 18, // Bedding @18%
      "Toys (0-2 Years)": 18, // Toys @18%
      "Toys (3-5 Years)": 18, // Toys @18%
      "Toys (6-12 Years)": 18, // Toys @18%
      "Baby Monitors & Health": 18, // Monitors @18%
      "Potty Training": 18, // Potty items @18%
      "Kids Room Decor": 18, // Decor @18%
      "Strollers & Prams": 18, // Strollers @18%
      "Car Seats": 18, // Car seats @18%
      "Baby Carriers & Slings": 18, // Carriers @18%
      "Kids Furniture": 18, // Furniture @18% [citation:8]
      "Kids Footwear": 12, // Kids shoes @12%
      "Baby Gifts & Sets": 18, // Gift sets @18%
      "Kids Sports & Outdoor Play": 18, // Sports @18%
      "Baby Walkers & Activity Centers": 18, // Walkers @18%
      "Teething & Pacifiers": 18, // Teethers @18%
      "Baby Travel & On The Go": 18, // Travel gear @18%
      "Baby Proofing & Electrical Safety": 18, // Safety @18%
      "Kids Swimwear & Beach Gear": 12, // Swimwear @12%
      "Kids School Supplies & Stationery": 5, // Notebooks, pencils @5% [citation:1]
      "Baby Hampers & Laundry": 18, // Hampers @18%
      "Kids Party Supplies": 18, // Party items @18%
      "Twin & Multiples Gear": 18, // Twin gear @18%
      "Kids Musical Instruments": 18, // Instruments @18%
      "Kids Room Lighting": 18, // Lighting @18%
      "Kids Baking & Cooking Kits": 18, // Kits @18%
      "Kids Gardening Sets": 18, // Gardening @18%
      "Kids Art Easels & Supplies": 18, // Art supplies @18%
    },
    defaultRate: 18,
  },
  // ======================== AUTOMOBILE ========================
  {
    category: "Automobile",
    subcategories: {
      "Car Care & Cleaning": 18, // Car care @18%
      "Car Accessories (Interior)": 18, // Accessories @18%
      "Car Accessories (Exterior)": 18, // Accessories @18%
      "Oils & Fluids": 18, // Lubricants @18% [citation:4]
      "Car Electronics": 18, // Car electronics @18%
      "Car Safety & Security": 18, // Safety devices @18%
      "Wheels & Tires": 18, // Tires @18%
      "Lighting & Bulbs": 18, // Bulbs @18%
      "Performance Parts": 18, // Parts @18%
      "Car Audio": 18, // Audio @18%
      "Motorcycle Gear & Accessories": 18, // Bike gear @18%
      "Car Interior Organizers": 18, // Organizers @18%
      "Car Covers": 18, // Covers @18%
      "Towing & Hauling": 18, // Towing @18%
      "Vehicle Maintenance Tools": 18, // Tools @18%
      "Off-Road & 4x4": 18, // Off-road parts @18%
      "Paint Protection & Detailing": 18, // Detailing @18%
      "Car Batteries": 18, // Batteries @18% [citation:10]
      "Air Fresheners": 18, // Fresheners @18%
      "Electric Vehicle (EV) Accessories": 5, // EV chargers @5% [citation:6]
      "Bike & Scooty Accessories": 18, // Bike accessories @18%
      "Motorcycle Helmets": 18, // Helmets @18%
      "Motorcycle Riding Gear": 18, // Riding gear @18%
      "Two Wheeler Oils & Lubricants": 18, // Bike oils @18%
      "Two Wheeler Tyres & Tubes": 18, // Bike tires @18%
      "Two Wheeler Batteries": 18, // Bike batteries @18%
      "Two Wheeler Brake Parts & Pads": 18, // Brake parts @18%
      "Two Wheeler Lights & Indicators": 18, // Lights @18%
      "Two Wheeler Mirrors": 18, // Mirrors @18%
      "Two Wheeler Chains & Sprockets": 18, // Chains @18%
      "Car Jump Starters": 18, // Jump starters @18%
      "OBD2 Scanners & Diagnostic Tools": 18, // Scanners @18%
      "Car Tyre Inflators & Pumps": 18, // Inflators @18%
      "Car Polish Machine & Buffer": 18, // Polishers @18%
    },
    defaultRate: 18,
  },
  // ======================== BOOKS & LEARNING ========================
  {
    category: "Books & Learning",
    subcategories: {
      "Academic Textbooks": 0, // Books @0% (exempt) [citation:1]
      "Competitive Exams": 0, // Guide books @0%
      "Fiction (Novels & Stories)": 0, // Books @0%
      "Non-Fiction": 0, // Books @0%
      "Children's Books (0-5 Years)": 0, // Children's books @0%
      "Children's Books (6-12 Years)": 0, // Children's books @0%
      "Young Adult (YA)": 0, // Books @0%
      "Comics & Graphic Novels": 0, // Comics @0%
      "Audiobooks & Digital Learning": 18, // Digital learning @18%
      "Stationery & School Supplies": 5, // Notebooks, pencils @5% [citation:1]
      "Writing Instruments": 5, // Pens, pencils @5%
      "Art & Craft Books": 18, // Craft books @18%
      "Language Learning": 0, // Language books @0%
      "Religious & Spiritual Books": 0, // Religious books @0%
      "Exam Preparation Guides": 0, // Exam guides @0%
      "Educational Toys & Kits": 18, // Educational toys @18%
      "Early Learning Flashcards": 18, // Flashcards @18%
      "Medical & Health Books": 0, // Medical books @0%
      "Law Books": 0, // Law books @0%
      "Travel Books & Maps": 0, // Travel guides @0%
      "Dictionaries & Thesauruses": 0, // Dictionaries @0%
      "Encyclopedias & Reference": 0, // Encyclopedias @0%
      "Cookbooks & Recipe Books": 0, // Cookbooks @0%
      "Parenting & Childcare Books": 0, // Parenting books @0%
      "Financial & Investment Books": 0, // Finance books @0%
      "Puzzles & Activity Books (Adult)": 0, // Activity books @0%
      "Handwriting & Calligraphy Books": 0, // Handwriting books @0%
      "School Diaries & Planners": 5, // Planners @5%
      "Science Lab Manuals": 0, // Lab manuals @0%
      "Poetry Books": 0, // Poetry @0%
      "Biographies & Autobiographies": 0, // Biographies @0%
      "Horror & Thriller Books": 0, // Books @0%
      "Romance Books": 0, // Books @0%
      "Award Winning Books": 0, // Books @0%
    },
    defaultRate: 0,
  },
  // ======================== PETS ========================
  {
    category: "Pets",
    subcategories: {
      "Dog Food": 18, // Pet food @18%
      "Cat Food": 18, // Pet food @18%
      "Dog Accessories (Collar, Leash, Harness)": 18, // Accessories @18%
      "Cat Accessories (Collar, Harness, Leash)": 18, // Accessories @18%
      "Pet Beds & Furniture": 18, // Beds @18%
      "Pet Bowls & Feeders": 18, // Bowls @18%
      "Pet Grooming Supplies": 18, // Grooming @18%
      "Pet Toys": 18, // Toys @18%
      "Pet Hygiene & Waste Management": 18, // Hygiene @18%
      "Pet Health & Supplements": 18, // Supplements @18%
      "Flea & Tick Control": 18, // Flea control @18%
      "Pet Carriers & Travel": 18, // Carriers @18%
      "Small Animal Supplies (Hamster, Rabbit, Guinea Pig)": 18, // Small pet supplies @18%
      "Bird Supplies": 18, // Bird supplies @18%
      "Fish & Aquarium Supplies": 18, // Aquarium @18%
      "Reptile & Amphibian Supplies": 18, // Reptile supplies @18%
      "Pet Training Aids": 18, // Training @18%
      "Pet Treats & Chews": 18, // Treats @18%
      "Pet Doors & Gates": 18, // Doors @18%
      "Pet Ramps & Steps": 18, // Ramps @18%
      "Pet Strollers": 18, // Strollers @18%
      "Pet GPS Trackers": 18, // Trackers @18%
      "Pet Cameras & Monitors": 18, // Cameras @18%
      "Pet ID Tags": 18, // ID tags @18%
      "Pet Clothing & Costumes": 18, // Pet clothes @18%
      "Pet Car Seats & Barriers": 18, // Car seats @18%
      "Pet Dental Care": 18, // Dental @18%
      "Pet Cooling & Heating Products": 18, // Cooling/heating @18%
    },
    defaultRate: 18,
  },
  // ======================== FURNITURE ========================
  {
    category: "Furniture",
    subcategories: {
      "Living Room Furniture": 18, // Wooden/metal sofas @18% [citation:8]
      "Bedroom Furniture": 18, // Beds, wardrobes @18% [citation:8]
      "Dining Room Furniture": 18, // Dining sets @18% [citation:8]
      "Office Furniture": 18, // Office furniture @18% [citation:8]
      "Outdoor Furniture": 18, // Outdoor @18%
      "Children's Furniture": 18, // Kids furniture @18%
      "Storage Furniture": 18, // Storage units @18% [citation:8]
      "Kitchen & Dining Storage": 18, // Kitchen cabinets @18% [citation:8]
      "Bathroom Furniture": 18, // Bath furniture @18%
      "Mattresses & Bedding Support": 18, // Mattresses @18% (increased) [citation:8]
      "Accent Furniture": 18, // Accent pieces @18%
      "Furniture Hardware & Parts": 18, // Hardware @18% [citation:8]
      "Pet Furniture": 18, // Pet furniture @18%
      "Folding & Space Saving Furniture": 18, // Folding furniture @18%
      "Furniture Covers & Protection": 18, // Covers @18%
      "Modular Furniture": 18, // Modular @18%
      "Wall Shelves & Floating Shelves": 18, // Shelves @18%
      "Bar Furniture": 18, // Bar units @18%
      "Nursery Furniture": 18, // Nursery @18%
      "Dressing Tables & Vanities": 18, // Vanities @18%
      "Shoe Racks & Stands": 18, // Shoe racks @18%
      "Coat Racks & Hall Trees": 18, // Coat racks @18%
      "Plant Stands & Indoor Garden Furniture": 18, // Plant stands @18%
      "Room Dividers & Partitions": 18, // Dividers @18%
      "Futons & Folding Beds": 18, // Futons @18%
      "Bean Bags & Floor Cushions": 18, // Bean bags @18%
      "Swing Chairs & Hanging Furniture": 18, // Swings @18%
    },
    defaultRate: 18,
  },
  // ======================== SMART HOME ========================
  {
    category: "Smart Home",
    subcategories: {
      "Smart Speakers & Hubs": 18, // Smart speakers @18%
      "Smart Lighting": 18, // LED fixtures @18% [citation:8]
      "Smart Security Cameras": 18, // CCTV @18% [citation:10]
      "Smart Locks & Access Control": 18, // Locks @18%
      "Smart Thermostats & HVAC": 18, // Thermostats @18%
      "Smart Sensors (Motion, Contact, Leak, Smoke)": 18, // Sensors @18%
      "Smart Plugs & Outlets": 18, // Plugs @18%
      "Smart Vacuum & Mops": 18, // Robot vacuums @18%
      "Smart Kitchen Appliances": 18, // Smart kitchen @18%
      "Smart Blinds & Curtains": 18, // Smart blinds @18%
      "Smart Irrigation & Garden": 18, // Irrigation controllers @18%
      "Smart Leak & Water Shutoff": 18, // Leak detectors @18%
      "Smart Health & Air Quality": 18, // Air purifiers @18%
      "Smart Doorbells & Chimes": 18, // Smart doorbells @18%
      "Smart Garage Door Controllers": 18, // Garage controllers @18%
      "Smart Fans & Ceiling Fans": 18, // Ceiling fans @18% [citation:10]
      "Smart Pet Feeders & Water Fountains": 18, // Pet feeders @18%
      "Smart Water Heaters": 18, // Smart water heaters @18%
    },
    defaultRate: 18,
  },
  // ======================== JEWELRY ========================
  {
    category: "Jewelry",
    subcategories: {
      Rings: 3, // Gold jewelry @3% (special)
      "Necklaces & Pendants": 3, // Gold jewelry @3%
      Earrings: 3, // Gold jewelry @3%
      "Bracelets & Bangles": 3, // Gold jewelry @3%
      "Pendants Only (Without Chain)": 3, // Gold jewelry @3%
      Anklets: 3, // Gold jewelry @3%
      "Men's Jewelry": 3, // Gold jewelry @3%
      "Kids Jewelry": 3, // Gold jewelry @3%
      "Body Jewelry": 18, // Fashion/body jewelry @18%
      "Wedding & Bridal Jewelry": 3, // Gold jewelry @3%
      "Gemstone Jewelry": 3, // Gold/gemstone @3%
      "Pearl Jewelry": 3, // Gold/pearl @3%
      "Brooches & Pins": 3, // Gold brooches @3%
      "Toe Rings": 3, // Gold toe rings @3%
      "Jewelry Sets": 3, // Gold sets @3%
      "Nose Rings & Septum Jewelry": 3, // Gold nose rings @3%
      "Charms & Charm Holders": 3, // Gold charms @3%
      "Watch & Jewelry Storage": 18, // Storage boxes @18%
      "Religious & Spiritual Jewelry": 3, // Gold religious @3%
      "Jewelry Making & Repair Components": 18, // Components @18%
      "Silver Jewelry (Pure/Sterling)": 3, // Silver jewelry @3%
      "Gold Jewelry (Pure/Karat)": 3, // Gold @3%
      "Fashion/Costume Jewelry": 18, // Costume/fashion jewelry @18%
    },
    defaultRate: 18,
  },
  // ======================== INDUSTRIAL & TOOLS ========================
  {
    category: "Industrial & Tools",
    subcategories: {
      "Power Tools": 18, // Power tools @18%
      "Hand Tools": 18, // Hand tools @18%
      "Tool Storage": 18, // Tool storage @18%
      Welding: 18, // Welding equipment @18%
      Ladders: 18, // Ladders @18%
      Compressors: 18, // Compressors @18%
      Generators: 18, // Generators @18%
      "Material Handling": 18, // Material handling @18%
      Adhesives: 18, // Adhesives @18%
      Abrasives: 18, // Abrasives @18%
      Janitorial: 18, // Janitorial supplies @18%
      "Safety Gear": 18, // Safety equipment @18%
      Measuring: 18, // Measuring tools @18%
      Fasteners: 18, // Fasteners @18%
      Electrical: 18, // Electrical supplies @18%
      Plumbing: 18, // Plumbing supplies @18%
      Paints: 28, // Paints @28% (luxury)
    },
    defaultRate: 18,
  },
  // ======================== TRAVEL & LUGGAGE ========================
  {
    category: "Travel & Luggage",
    subcategories: {
      "Suitcases & Luggage": 18, // Suitcases @18%
      "Travel Backpacks": 18, // Backpacks @18%
      "Travel Organizers & Accessories": 18, // Organizers @18%
      "Travel Gadgets & Electronics": 18, // Gadgets @18%
      "Travel Bags (Duffel & Weekender)": 18, // Duffel bags @18%
      "Kids Travel Gear": 18, // Kids travel gear @18%
      "Laptop Backpacks & Briefcases": 18, // Laptop bags @18%
      "Camera Bags & Backpacks": 18, // Camera bags @18%
      "Hydration Packs & Vests": 18, // Hydration packs @18%
      "Packable & Lightweight Daypacks": 18, // Daypacks @18%
      "Anti-Theft Travel Bags": 18, // Anti-theft bags @18%
    },
    defaultRate: 18,
  },
];

/**
 * Get GST rate based on category and subcategory
 * @param category - Product category (e.g., "Books & Learning")
 * @param subcategory - Product subcategory (e.g., "Exam Prep")
 * @returns GST rate in percentage (e.g., 5, 12, 18, 28)
 */
export function getGstRate(category: string, subcategory: string): number {
  // If no category provided, return default 18%
  if (!category) {
    console.warn(`⚠️ No category provided, using default GST rate 18%`);
    return 18;
  }

  // Find category configuration (case-insensitive)
  const categoryConfig = GST_RATES.find(
    (config) => config.category.toLowerCase() === category.toLowerCase(),
  );

  if (!categoryConfig) {
    console.warn(
      `⚠️ Category "${category}" not found in GST mapping, using default rate 18%`,
    );
    return 18;
  }

  // If no subcategory provided, return category default rate
  if (!subcategory) {
    console.warn(
      `⚠️ No subcategory provided for category "${category}", using default rate ${categoryConfig.defaultRate}%`,
    );
    return categoryConfig.defaultRate;
  }

  // Find subcategory rate (case-insensitive)
  const matchedSubcategory = Object.keys(categoryConfig.subcategories).find(
    (key) => key.toLowerCase() === subcategory.toLowerCase(),
  );

  if (matchedSubcategory) {
    const rate = categoryConfig.subcategories[matchedSubcategory];
    console.log(
      `✅ GST Rate Found: ${category} → ${matchedSubcategory} → ${rate}%`,
    );
    return rate;
  }

  // Subcategory not found, return category default rate
  console.warn(
    `⚠️ Subcategory "${subcategory}" not found under "${category}", using default rate ${categoryConfig.defaultRate}%`,
  );
  return categoryConfig.defaultRate;
}

/**
 * Get all available categories
 * @returns Array of category names
 */
export function getAllCategories(): string[] {
  return GST_RATES.map((config) => config.category);
}

/**
 * Get all subcategories for a specific category
 * @param category - Category name
 * @returns Array of subcategory names
 */
export function getSubcategories(category: string): string[] {
  const categoryConfig = GST_RATES.find(
    (config) => config.category.toLowerCase() === category.toLowerCase(),
  );

  if (!categoryConfig) {
    console.warn(`⚠️ Category "${category}" not found`);
    return [];
  }

  return Object.keys(categoryConfig.subcategories);
}

/**
 * Check if a category exists in mapping
 * @param category - Category name
 * @returns boolean
 */
export function isValidCategory(category: string): boolean {
  return GST_RATES.some(
    (config) => config.category.toLowerCase() === category.toLowerCase(),
  );
}

/**
 * Check if a subcategory exists under a category
 * @param category - Category name
 * @param subcategory - Subcategory name
 * @returns boolean
 */
export function isValidSubcategory(
  category: string,
  subcategory: string,
): boolean {
  const categoryConfig = GST_RATES.find(
    (config) => config.category.toLowerCase() === category.toLowerCase(),
  );

  if (!categoryConfig) return false;

  return Object.keys(categoryConfig.subcategories).some(
    (key) => key.toLowerCase() === subcategory.toLowerCase(),
  );
}

/**
 * Add or update a GST rate (for admin use)
 * @param category - Category name
 * @param subcategory - Subcategory name
 * @param rate - GST rate percentage
 */
export function addOrUpdateGstRate(
  category: string,
  subcategory: string,
  rate: number,
): void {
  let categoryConfig = GST_RATES.find(
    (config) => config.category.toLowerCase() === category.toLowerCase(),
  );

  if (!categoryConfig) {
    // Create new category
    categoryConfig = {
      category: category,
      subcategories: {},
      defaultRate: 18,
    };
    GST_RATES.push(categoryConfig);
  }

  // Add or update subcategory
  categoryConfig.subcategories[subcategory] = rate;
  console.log(`✅ GST Rate Updated: ${category} → ${subcategory} → ${rate}%`);
}
