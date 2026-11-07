import { notFound } from "next/navigation";
import { getDict } from "@/i18n";
import { Notice } from "@/components/ui/misc";

// Draft documents for the MVP. They must be reviewed by a lawyer before launch (see docs/LEGAL-TODO.md).
const DOCS = {
  privacy: {
    ru: {
      title: "Политика конфиденциальности (черновик)",
      body: [
        "Мы собираем минимум данных: e-mail и имя взрослого, имя и год рождения ребёнка, школьные достижения, которые родитель добавляет сам.",
        "Фото и сканы документов используются только для проверки и удаляются сразу после решения модератора.",
        "Публичный паспорт игрушки не содержит персональных данных владельца, если он сам не включил показ имени.",
        "Мы не храним IP-адреса в открытом виде — только хеш для защиты от злоупотреблений.",
        "Школьные данные никогда не публикуются в блокчейне и не передаются партнёрам.",
        "Вы можете удалить аккаунт в настройках. Детские профили и их данные удаляются вместе с аккаунтом родителя.",
      ],
    },
    en: {
      title: "Privacy policy (draft)",
      body: [
        "We collect minimal data: the adult's e-mail and name, the child's name and year of birth, and school achievements entered by the parent.",
        "Photos and scans are used only for review and are deleted immediately after the moderator's decision.",
        "The public toy passport contains no personal data of the owner unless they opt in to show their name.",
        "We do not store raw IP addresses — only a keyed hash for abuse protection.",
        "School data is never published on a blockchain or shared with partners.",
        "You can delete your account in settings. Child profiles and their data are deleted with the parent's account.",
      ],
    },
  },
  terms: {
    ru: {
      title: "Условия использования (черновик)",
      body: [
        "Аккаунт создаёт совершеннолетний пользователь. Детские профили управляются родителем или законным представителем.",
        "MODU Points — бонусные баллы программы лояльности. Они не являются деньгами, не продаются и не обмениваются на криптовалюту.",
        "Владение игрушкой в системе подтверждается одноразовым кодом активации. Передача владения выполняется через код передачи.",
        "Партнёры с пометкой «концепт» показаны для демонстрации; партнёрство с ними не подтверждено.",
      ],
    },
    en: {
      title: "Terms of use (draft)",
      body: [
        "Accounts are created by adults. Child profiles are managed by a parent or legal guardian.",
        "MODU Points are loyalty bonus points. They are not money, are not sold and cannot be exchanged for crypto.",
        "Ownership of a toy is established with a one-time activation code. Ownership transfers use a transfer code.",
        "Partners marked “concept” are shown for demonstration; no partnership is confirmed.",
      ],
    },
  },
  parents: {
    ru: {
      title: "Для родителей: согласие и контроль",
      body: [
        "Ребёнок не регистрируется сам: профиль создаёт родитель, давая согласие на обработку минимальных данных (версия parents-v1).",
        "Баллы MODU School начисляются только после проверки модератором. Больше баллов дают улучшения результата, а не только высокие оценки.",
        "Детская часть приложения полностью отделена от раздела MODU Coin и криптокошельков.",
        "Вы можете в любой момент удалить отдельное достижение или весь профиль ребёнка.",
      ],
    },
    en: {
      title: "For parents: consent and control",
      body: [
        "Children don't sign up themselves: a parent creates the profile and consents to minimal data processing (version parents-v1).",
        "MODU School points are awarded only after moderator review. Improvement earns more than high grades alone.",
        "The children's part of the app is fully separated from MODU Coin and crypto wallets.",
        "You can delete any achievement or the whole child profile at any time.",
      ],
    },
  },
  web3: {
    ru: {
      title: "Раскрытие рисков Web3 (testnet)",
      body: [
        "MODU Coin и NFT-сертификаты существуют только в тестовой сети и не имеют денежной стоимости.",
        "Это не предложение инвестиций, не публичная продажа токенов и не обещание доходности.",
        "Выпуск в основной сети возможен только после юридического анализа и через лицензированную инфраструктуру.",
        "Подпись при подключении кошелька подтверждает владение адресом и не даёт доступа к средствам.",
      ],
    },
    en: {
      title: "Web3 risk disclosure (testnet)",
      body: [
        "MODU Coin and NFT certificates exist only on a test network and have no monetary value.",
        "This is not an investment offer, a public token sale or a promise of returns.",
        "A mainnet launch is only possible after legal review and through licensed infrastructure.",
        "The wallet-linking signature proves address ownership and grants no access to funds.",
      ],
    },
  },
} as const;

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const { locale } = await getDict();
  const entry = DOCS[doc as keyof typeof DOCS];
  if (!entry) notFound();
  const d = locale === "en" || locale === "pl" ? entry.en : entry.ru;
  return (
    <article className="container-x max-w-3xl py-12">
      <h1 className="text-4xl font-extrabold">{d.title}</h1>
      <Notice tone="warning" className="mt-6">
        {locale === "en" ? "MVP draft — requires legal review before production launch." : "Черновик MVP — требует юридической проверки перед запуском."}
      </Notice>
      <ol className="mt-8 list-decimal space-y-4 pl-6 leading-relaxed text-cream/85">
        {d.body.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>
    </article>
  );
}
