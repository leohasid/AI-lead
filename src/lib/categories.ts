// Business types the user can filter the deck by. Each maps to OpenStreetMap
// tags; an empty `values` list means "anything with this tag".

export const TAG_KEYS = ["shop", "office", "craft", "amenity", "leisure", "tourism", "healthcare"] as const;
export type TagFilter = { key: (typeof TAG_KEYS)[number]; values: string[] };

export const CATEGORIES: { id: string; label: string; filters: TagFilter[] }[] = [
  { id: "food", label: "Restaurants & cafés", filters: [{ key: "amenity", values: ["restaurant", "cafe", "fast_food"] }] },
  { id: "bars", label: "Bars & pubs", filters: [{ key: "amenity", values: ["bar", "pub", "nightclub"] }] },
  {
    id: "health",
    label: "Health & dental",
    filters: [
      { key: "amenity", values: ["dentist", "doctors", "clinic", "veterinary", "pharmacy"] },
      { key: "healthcare", values: ["physiotherapist", "optometrist", "psychotherapist", "alternative"] },
      { key: "shop", values: ["optician", "hearing_aids"] },
    ],
  },
  { id: "beauty", label: "Hair & beauty", filters: [{ key: "shop", values: ["hairdresser", "beauty", "massage", "tattoo", "cosmetics"] }] },
  { id: "fitness", label: "Gyms & fitness", filters: [{ key: "leisure", values: ["fitness_centre", "sports_centre", "dance"] }] },
  {
    id: "retail",
    label: "Shops & retail",
    filters: [
      {
        key: "shop",
        values: ["clothes", "shoes", "jewelry", "florist", "furniture", "gift", "books", "bicycle", "electronics", "bakery", "butcher", "toys", "sports", "pet", "interior_decoration"],
      },
    ],
  },
  { id: "trades", label: "Trades & home services", filters: [{ key: "craft", values: [] }] },
  {
    id: "professional",
    label: "Professional services",
    filters: [
      {
        key: "office",
        values: ["accountant", "lawyer", "estate_agent", "insurance", "financial", "financial_advisor", "tax_advisor", "architect", "consulting", "employment_agency"],
      },
    ],
  },
  {
    id: "tech",
    label: "Tech & agencies",
    filters: [
      { key: "office", values: ["it", "company", "advertising_agency", "telecommunication", "coworking", "graphic_design"] },
      { key: "shop", values: ["computer"] },
    ],
  },
  { id: "hotels", label: "Hotels & stays", filters: [{ key: "tourism", values: ["hotel", "guest_house", "hostel"] }] },
  {
    id: "auto",
    label: "Cars & automotive",
    filters: [
      { key: "shop", values: ["car", "car_repair", "tyres", "motorcycle"] },
      { key: "amenity", values: ["car_wash", "car_rental", "driving_school"] },
    ],
  },
  { id: "education", label: "Education & childcare", filters: [{ key: "amenity", values: ["childcare", "kindergarten", "language_school", "music_school"] }] },
];

export const categoryLabels = (ids: string[]) => CATEGORIES.filter((c) => ids.includes(c.id)).map((c) => c.label);
