export type Role = "child" | "parent" | "collector" | "partner" | "admin";

export type Locale = "ru" | "en" | "be" | "pl";

export type LocalizedText = Partial<Record<Locale, string>>;

export type CharacterContent = Partial<
  Record<Locale, { tagline: string; story: string; traits: string[] }>
>;

export type Accessory = { slug: string; kind: "physical" | "digital"; name: LocalizedText };

export type Character = {
  id: string;
  slug: string;
  name: string;
  serial_prefix: string;
  series: string;
  min_age: number;
  rarity: "common" | "rare" | "epic" | "legendary";
  content: CharacterContent;
  accessories: Accessory[];
  image_path: string;
  accent_color: string;
};
