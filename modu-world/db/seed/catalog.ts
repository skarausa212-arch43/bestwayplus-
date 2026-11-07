// Production catalogue content (characters). Not demo data.
export const characters = [
  {
    slug: "modu-bear",
    name: "MODU BEAR",
    serial_prefix: "MB",
    series: "Genesis",
    min_age: 5,
    rarity: "common",
    image_path: "/assets/modu/bear.webp",
    accent_color: "#F4B58D",
    sort_order: 1,
    content: {
      ru: {
        tagline: "Добрый друг, с которого начинается мир MODU.",
        story:
          "BEAR — первый житель MODU WORLD. Он носит худи с вышитым орнаментом и всегда первым здоровается. Помогает младшим исследователям делать первые шаги: читать, считать и не бояться ошибок.",
        traits: ["5+", "Мягкие формы", "Худи с орнаментом", "NFC в основании"],
      },
      en: {
        tagline: "The kind friend where the MODU world begins.",
        story:
          "BEAR is the first citizen of MODU WORLD. He wears an embroidered hoodie and is always the first to say hi. He helps young explorers take their first steps: reading, counting and not being afraid of mistakes.",
        traits: ["5+", "Soft shapes", "Embroidered hoodie", "NFC in the base"],
      },
    },
    accessories: [
      { slug: "bear-backpack", kind: "physical", name: { ru: "Мини-рюкзак", en: "Mini backpack" } },
      { slug: "bear-stand-belarus", kind: "physical", name: { ru: "Подставка «Made in Belarus»", en: "“Made in Belarus” stand" } },
      { slug: "bear-autumn-look", kind: "digital", name: { ru: "Цифровой образ «Осень»", en: "Digital look “Autumn”" } },
    ],
  },
  {
    slug: "modu-rabbit",
    name: "MODU RABBIT",
    serial_prefix: "MR",
    series: "Genesis",
    min_age: 10,
    rarity: "rare",
    image_path: "/assets/modu/rabbit.webp",
    accent_color: "#D6A23C",
    sort_order: 2,
    content: {
      ru: {
        tagline: "Технологичный, модный и всегда на связи.",
        story:
          "RABBIT собирает гаджеты из всего, что найдёт. Пиксельные очки показывают ему подсказки, а наушники ловят новые идеи. Он любит программирование, музыку и командные задания.",
        traits: ["10+", "Пиксельные очки", "Наушники MODU", "Сумка с орнаментом"],
      },
      en: {
        tagline: "Techy, stylish and always online.",
        story:
          "RABBIT builds gadgets out of anything. Pixel goggles show him hints and the headphones catch new ideas. He loves coding, music and team quests.",
        traits: ["10+", "Pixel goggles", "MODU headphones", "Ornament crossbody bag"],
      },
    },
    accessories: [
      { slug: "rabbit-headphones-gold", kind: "physical", name: { ru: "Наушники Gold", en: "Gold headphones" } },
      { slug: "rabbit-skate", kind: "physical", name: { ru: "Мини-скейт", en: "Mini skateboard" } },
      { slug: "rabbit-neon-look", kind: "digital", name: { ru: "Цифровой образ «Неон»", en: "Digital look “Neon”" } },
    ],
  },
  {
    slug: "modu-dragon",
    name: "MODU DRAGON",
    serial_prefix: "MD",
    series: "Genesis",
    min_age: 15,
    rarity: "epic",
    image_path: "/assets/modu/dragon.webp",
    accent_color: "#AAB0B8",
    sort_order: 3,
    content: {
      ru: {
        tagline: "Выразительный коллекционный персонаж с характером.",
        story:
          "DRAGON охраняет старые замки и новые идеи. Колючий снаружи, тёплый внутри. Коллекционная версия с металлизированными рогами выпускается ограниченными сериями с номером экземпляра.",
        traits: ["15+", "Металлизированные рога", "Лимитированные серии", "Номер экземпляра"],
      },
      en: {
        tagline: "An expressive collector character with attitude.",
        story:
          "DRAGON guards old castles and new ideas. Spiky outside, warm inside. The collector version with metallic horns is produced in limited, individually numbered runs.",
        traits: ["15+", "Metallic horns", "Limited runs", "Numbered edition"],
      },
    },
    accessories: [
      { slug: "dragon-jacket-silver", kind: "physical", name: { ru: "Куртка Silver", en: "Silver jacket" } },
      { slug: "dragon-castle-base", kind: "physical", name: { ru: "Подставка «Замок»", en: "“Castle” base" } },
      { slug: "dragon-ember-look", kind: "digital", name: { ru: "Цифровой образ «Пламя»", en: "Digital look “Ember”" } },
    ],
  },
];
