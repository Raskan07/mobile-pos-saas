/**
 * lib/types/shop.ts
 *
 * Types for Shop registration, geolocation, and management
 */

export interface Shop {
  id?: string;             // Firestore auto doc ID
  shopId: string;          // Unique Shop identifier (e.g., SHOP-7294 or user custom)
  shopName: string;        // Name of the mobile shop
  ownerName: string;       // Shop owner's full name
  phone: string;           // Contact phone number
  email?: string;          // Contact / billing email
  address?: string;        // Physical store location
  latitude?: number;       // Geolocation latitude
  longitude?: number;      // Geolocation longitude
  status: "active" | "inactive" | "pending";
  createdAt: number;       // Unix timestamp in ms
  updatedAt: number;       // Unix timestamp in ms
  staffCount?: number;     // Aggregated staff count
}

export interface CreateShopInput {
  shopId: string;
  shopName: string;
  ownerName: string;
  phone: string;
  email?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}
