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

/** listing key = `${platform}:${source_id}` — matches scraper/embeddings.py's _listing_key */
export type ListingKey = string;

export interface PhotoEmbedding {
  url: string;
  embedding: number[];
}

export interface ListingEmbeddings {
  photos: PhotoEmbedding[];
  text_embedding: number[] | null;
}

export type EmbeddingsData = Record<ListingKey, ListingEmbeddings>;
