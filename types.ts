
export type StyleType = 
  | "Anime" 
  | "Realistic" 
  | "Cartoon" 
  | "Fantasy" 
  | "Sci-Fi" 
  | "Pixel Art" 
  | "3D Render" 
  | "Watercolor" 
  | "Oil Painting" 
  | "Comic Book" 
  | "Black & White";

export type AspectRatioType = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";

export interface GeneratedImage {
  id: string;
  url: string;
  description: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
}

export interface Session {
  id: string;
  name: string;
  style: StyleType;
  aspectRatio: AspectRatioType;
  referenceFile: File | null;
  referencePreview: string | null;
  scenesText: string;
  results: GeneratedImage[];
  isGenerating: boolean;
  progress: number;
  total: number;
}

export type UserPlan = 'free' | 'basic' | 'standard' | 'premium' | 'ultimate';

export interface UserProfile {
  uid: string;
  email: string | null;
  createdAt: number;
  plan: UserPlan;
  credits: number; // Free credits remaining
  dailyLimit: number;
  dailyUsed: number;
  lastUsedDate: string; // YYYY-MM-DD
  expiryDate: number | null; // Timestamp
}

export interface SubscriptionPlan {
  id: UserPlan;
  name: string;
  price: number;
  limit: number;
  description: string;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  { id: 'basic', name: 'Basic', price: 100000, limit: 50, description: '50 images / day' },
  { id: 'standard', name: 'Standard', price: 200000, limit: 150, description: '150 images / day' },
  { id: 'premium', name: 'Premium', price: 400000, limit: 1000, description: '1,000 images / day' },
  { id: 'ultimate', name: 'Ultimate', price: 999000, limit: 3000, description: '3,000 images / day' },
];
