# Google Play — materiały witryny LUMI

Всё, что вставляется в Play Console → Store presence → Main store listing.
Тексты — по-польски (язык листинга по умолчанию: polski — PL).
Лимиты Google проверены: название ≤30, короткое описание ≤80, полное ≤4000.

---

## Nazwa aplikacji (App name, max 30 znaków)

```
LUMI – sprzątanie domu
```

## Krótki opis (Short description, max 80 znaków)

```
Sprzątanie i usługi domowe we Wrocławiu. Stała cena z góry i szybka rezerwacja.
```

## Pełny opis (Full description, max 4000 znaków)

```
LUMI to sprzątanie i usługi domowe we Wrocławiu — zamawiasz w aplikacji,
cenę znasz z góry, a sprawdzony wykonawca przyjeżdża pod Twoje drzwi.

JAK TO DZIAŁA
1. Wybierz usługę i dom — podaj liczbę pokoi i łazienek.
2. Cena pojawia się od razu, zanim cokolwiek zamówisz. Bez wycen
   „do uzgodnienia" i niespodzianek na końcu.
3. Zapłać kartą w aplikacji. Wykonawca dostaje zlecenie, a Ty na bieżąco
   widzisz status: przyjęte, w drodze, w trakcie, zakończone.

USŁUGI
• Sprzątanie standardowe, generalne, po remoncie i przy przeprowadzce
• Sprzątanie mieszkań na wynajem krótkoterminowy (między gośćmi)
• Mycie okien — od środka i z zewnątrz
• Ogród: trawnik, żywopłot, pielęgnacja
• Usługi dodatkowe: lodówka, piekarnik, prasowanie, pranie i inne
• Wkrótce: elektryk, hydraulik, złota rączka, pralnia chemiczna

DLACZEGO LUMI
• Stała cena z góry — kalkulator pokazuje koszt przed rezerwacją
• Sprawdzeni wykonawcy z ocenami i opiniami klientów
• Bezpieczne płatności kartą (Stripe) — bez gotówki
• Czat z wykonawcą i zdjęcia przed/po wykonanej usłudze
• Rachunek w PDF do każdego zamówienia
• Twoje domy w jednym miejscu: adresy, metraż, przypomnienia
  o regularnym sprzątaniu

LUMI+
Subskrypcja dla domu: 5% zwrotu za każde zamówienie na saldo LUMI,
priorytetowe przydzielanie wykonawców i stała zniżka. Anulujesz w każdej
chwili — korzyści działają do końca opłaconego okresu.

DLA WYKONAWCÓW
Sprzątasz zawodowo? Dołącz do LUMI jako wykonawca: zlecenia w Twojej
okolicy, jasne stawki i wypłaty prosto na konto. Rejestracja w aplikacji.

REGION
Działamy we Wrocławiu. Kolejne miasta już wkrótce.

KONTAKT
support@lumi24.pl · https://lumi24.pl
Operator: BESTWAY PLUS Sp. z o.o., ul. Zajączkowska 44, 51-180 Wrocław
```

---

## Grafika

| Файл | Куда в Play Console | Размер |
|---|---|---|
| `icon-512.png` | App icon | 512×512 |
| `feature-graphic.png` | Feature graphic | 1024×500 |
| `shot-1-zamow.png` | Phone screenshots #1 — главный экран | 1080×1920 |
| `shot-2-kalkulator.png` | #2 — заказ: услуги и цены | 1080×1920 |
| `shot-3-zlecenia.png` | #3 — конфигуратор уборки | 1080×1920 |
| `shot-4-lumiplus.png` | #4 — подписка LUMI+ | 1080×1920 |
| `shot-5-domy.png` | #5 — мои дома | 1080×1920 |

Скриншоты сняты с польской версии приложения (демо-данные).
Перегенерация графики: `node scripts/make-store-assets.js` (иконка и баннер
рисуются из того же векторного источника, что и иконка приложения).

## Остальные поля листинга

- **Категория:** House & Home
- **Теги:** cleaning, home services
- **Email:** support@lumi24.pl
- **Сайт:** https://lumi24.pl
- **Privacy policy:** https://lumi24.pl/privacy.html
