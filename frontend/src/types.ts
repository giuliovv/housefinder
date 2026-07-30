export interface ListingSummary {
  source_id: string;
  agency: string;
  platform: string;
  url: string;
  address: string;
  price_text: string;
  price_pcm: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  receptions: number | null;
  thumbnail_url: string | null;
  status: string | null;
}

export interface Listing {
  summary: ListingSummary;
  description: string;
  key_features: string[];
  photo_urls: string[];
  agency_name: string;
}
