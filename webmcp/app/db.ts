export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  imageUrl: string;
  tags: string[];
};

export const products: Product[] = [
  {
    id: "trail-daypack",
    name: "Trail Daypack",
    category: "Bags",
    price: 89,
    description: "A lightweight daypack built for commuting, short hikes, and everyday carry.",
    imageUrl:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80",
    tags: ["outdoor", "travel", "commuter"],
  },
  {
    id: "summit-bottle",
    name: "Summit Bottle",
    category: "Accessories",
    price: 24,
    description: "An insulated stainless steel bottle that keeps drinks cold on the go.",
    imageUrl:
      "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=80",
    tags: ["hydration", "steel", "travel"],
  },
  {
    id: "cloud-runner",
    name: "Cloud Runner",
    category: "Footwear",
    price: 129,
    description: "Cushioned running shoes made for daily miles and all-day comfort.",
    imageUrl:
      "https://images.unsplash.com/photo-1543508282-6319a3e2621f?auto=format&fit=crop&w=900&q=80",
    tags: ["running", "sport", "lightweight"],
  },
  {
    id: "coast-hoodie",
    name: "Coast Hoodie",
    category: "Apparel",
    price: 74,
    description: "A soft midweight hoodie designed for layering in cool weather.",
    imageUrl:
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80",
    tags: ["casual", "cotton", "layering"],
  },
  {
    id: "field-journal",
    name: "Field Journal",
    category: "Stationery",
    price: 19,
    description: "A durable pocket notebook with dot-grid pages for notes and sketches.",
    imageUrl:
      "https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=900&q=80",
    tags: ["notebook", "writing", "portable"],
  },
  {
    id: "studio-lamp",
    name: "Studio Lamp",
    category: "Home",
    price: 149,
    description: "An adjustable desk lamp with warm dimmable lighting for focused work.",
    imageUrl:
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80",
    tags: ["desk", "lighting", "home office"],
  },
];