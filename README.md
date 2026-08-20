# Naslai Studio — frontend

React + TypeScript. Marketplace uchun mahsulot kartalarini yaratish oqimi:

`foto yuklash → AI brif → Uzum/WB/Ozon preseti → narx → tokenni yechish → generatsiya → yuklab olish`

Backend alohida loyihada: `naslai_drf` (Django REST Framework).

## Ishga tushirish

Avval backendni ko'taring (`naslai_drf` papkasida):

```bash
DJANGO_DEBUG=1 python manage.py runserver 127.0.0.1:8787
```

So'ng frontendni:

```bash
npm install
npm run dev
```

Oching: **http://127.0.0.1:5173/**

Vite `/api` va `/media` so'rovlarini Django'ga (127.0.0.1:8787) uzatadi —
`vite.config.ts` ga qarang. Shuning uchun brauzer uchun hammasi bitta
manzil bo'lib ko'rinadi va CORS muammosi umuman chiqmaydi. Bu prod'dagi
tuzilishning aynan o'zi (naslai.uz + nginx).

Django portini o'zgartirsangiz — `vite.config.ts` dagi `DJANGO_ORIGIN` ni
ham o'zgartiring.

## Tuzilishi

- `src/app/apiClient.ts` — **barcha** so'rovlar shu yerdan o'tadi: CSRF
  sarlavhasi va manzil asosi shu yerda qo'shiladi. So'rovni to'g'ridan-
  to'g'ri `fetch` bilan yozsangiz, POST/PATCH/DELETE 403 bilan qaytadi.
- `src/app/account/` — hisob, sessiya, admin panel API'si.
- `src/features/create/domain` — mahsulot turlari va marketplace presetlari.
- `src/features/create/services/createApi.ts` — generatsiya API'si.
- `src/features/create/hooks/useCreateFlow.ts` — oqim holati.
- `src/features/create/components` — vizual komponentlar.
- `src/styles` — dizayn tokenlari.
- `src/i18n` — uz / ru tarjimalari.

## Autentifikatsiya

Sessiya cookie'si (`HttpOnly`), localStorage'dagi token emas — sahifadagi
begona skript uni o'qiy olmaydi.

Buning evaziga Django har bir POST/PATCH/DELETE so'rovida `X-CSRFToken`
sarlavhasini talab qiladi. `apiFetch` uni `csrftoken` cookie'sidan olib
o'zi qo'yadi; cookie'ni backend `GET /api/auth/session` javobida o'rnatadi
(sahifa yuklanganda birinchi bo'lib shu chaqiriladi).

## Yig'ish

```bash
npm run build      # dist/ papkasi — nginx shuni tarqatadi
npm run lint       # tsc -b, tiplarni tekshiradi
```

Agar API alohida domenga chiqarilsa (masalan api.naslai.uz), `VITE_API_BASE`
o'zgaruvchisini to'ldiring. Bitta domenda bo'lsa — kerak emas va shunisi
tavsiya etiladi.

## Hali ulanmagani

- **Click / Payme to'lovlari.** Buyurtma yaratish tugmasi bor, lekin
  backend to'lovni ulanmagan deb javob beradi. Tokenlar faqat provayder
  tasdig'idan keyin qo'shilishi kerak.
- **Video generatsiya.** Provayder yo'q, narx koeffitsiyentlari vaqtinchalik.
- **Referal dasturi.** Kabinetda ko'rsatiladi, lekin backendda hisob
  yuritilmaydi — hozircha nollar keladi.
- **Natijaga baho berish.** Yulduzchalar ko'rinadi, hech qayerga ketmaydi.
