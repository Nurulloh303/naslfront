/**
 * Hujjatlar matni (Maxfiylik / Shartlar / Oferta).
 *
 * MUHIM: bu yuridik shablon, advokat tekshiruvidan o'tmagan. Ishga
 * tushirishdan oldin yurist bilan ko'rib chiqing va rekvizitlarni
 * (COMPANY) haqiqiylari bilan almashtiring.
 */

export type LegalDoc = "privacy" | "terms" | "offer";

export type LegalSection = { heading: string; body: string[] };
export type LegalPage = { title: string; updated: string; intro: string; sections: LegalSection[] };

/** Rekvizitlar — bitta joyda, keyin almashtirish oson. */
export const COMPANY = {
  name: "Naslai Studio",
  site: "naslai.uz",
  email: "hello@naslai.uz",
  telegram: "@naslaiadmin",
  updated: "2026-08-11",
};

const uz: Record<LegalDoc, LegalPage> = {
  privacy: {
    title: "Maxfiylik siyosati",
    updated: COMPANY.updated,
    intro: `Ushbu siyosat ${COMPANY.site} xizmatidan foydalanganda qanday ma'lumotlar to'planishini va ular qanday ishlatilishini tushuntiradi.`,
    sections: [
      {
        heading: "Qanday ma'lumotlar to'planadi",
        body: [
          "Akkaunt ma'lumotlari: ism, email, interfeys tili, qo'llab-quvvatlash kodi.",
          "Siz yuklagan mahsulot fotosuratlari va generatsiya sozlamalari (mahsulot nomi, kategoriya, afzalliklar).",
          "Texnik ma'lumotlar: so'rov vaqti, xatolik loglari, token operatsiyalari tarixi.",
        ],
      },
      {
        heading: "Ma'lumotlar nima uchun ishlatiladi",
        body: [
          "Rasm generatsiyasini bajarish va natijani sizga qaytarish uchun.",
          "Token balansini yuritish va operatsiyalar tarixini ko'rsatish uchun.",
          "Xizmat sifatini oshirish, xatoliklarni topish va qo'llab-quvvatlash uchun.",
        ],
      },
      {
        heading: "Uchinchi tomonlar",
        body: [
          "Rasm generatsiyasi tashqi AI-provayder (OpenAI) orqali bajariladi — yuklangan foto va matnli brief shu xizmatga uzatiladi.",
          "Ma'lumotlaringiz reklama maqsadida sotilmaydi va uchinchi shaxslarga berilmaydi.",
        ],
      },
      {
        heading: "Saqlash muddati va o'chirish",
        body: [
          "Loyihalar va generatsiya natijalari akkaunt faol bo'lgan davrda saqlanadi.",
          `Akkauntni va barcha ma'lumotlarni o'chirish uchun ${COMPANY.telegram} ga yozing — so'rov 30 kun ichida bajariladi.`,
        ],
      },
      {
        heading: "Bog'lanish",
        body: [`Savollar bo'yicha: ${COMPANY.email} yoki Telegram ${COMPANY.telegram}.`],
      },
    ],
  },
  terms: {
    title: "Foydalanish shartlari",
    updated: COMPANY.updated,
    intro: `${COMPANY.site} xizmatidan foydalanish orqali siz quyidagi shartlarga rozilik bildirasiz.`,
    sections: [
      {
        heading: "Xizmat nima qiladi",
        body: [
          "Xizmat siz yuklagan mahsulot fotosuratlari asosida marketplace uchun kartalar, infografika va kreativlar yaratadi.",
          "Natija sun'iy intellekt tomonidan yaratiladi, shuning uchun har bir generatsiya noyob bo'ladi va aniq takrorlanmaydi.",
        ],
      },
      {
        heading: "Foydalanuvchi majburiyatlari",
        body: [
          "Siz yuklagan fotosuratlarga huquqingiz borligiga kafolat berasiz.",
          "Boshqa brendlarning logotipi, qalbaki mahsulot yoki qonun bilan taqiqlangan tovarlar rasmini yuklash mumkin emas.",
          "Generatsiya natijasidagi matnlar (afzalliklar, xususiyatlar) haqiqatga mos kelishini o'zingiz tekshirasiz — xizmat mahsulot tavsifi uchun javobgar emas.",
        ],
      },
      {
        heading: "Tokenlar",
        body: [
          "Har bir generatsiya token yechib oladi. Narx generatsiya turi, variantlar va sahifalar soniga bog'liq.",
          "Tokenlar so'rov serverga qabul qilinganda yechiladi. Texnik xatolik yuz bersa, tokenlar avtomatik qaytariladi.",
          "Tokenlar pulga qayta almashtirilmaydi va boshqa akkauntga o'tkazilmaydi.",
        ],
      },
      {
        heading: "Natijaga bo'lgan huquq",
        body: [
          "Yaratilgan rasmlardan tijorat maqsadida — marketplace kartalari, reklama, ijtimoiy tarmoqlar uchun — cheklovsiz foydalanishingiz mumkin.",
          "Xizmat natijaning marketplace qoidalariga mos kelishini kafolatlamaydi: har bir platformaning o'z talablari bor.",
        ],
      },
      {
        heading: "Cheklovlar",
        body: [
          "Xizmat \"borligicha\" taqdim etiladi. Uzilishlar, AI-provayder tomonidagi nosozliklar yoki natija sifati bo'yicha moddiy javobgarlik cheklangan.",
          "Shartlarni buzgan akkaunt ogohlantirishsiz to'xtatilishi mumkin.",
        ],
      },
    ],
  },
  offer: {
    title: "Ommaviy oferta",
    updated: COMPANY.updated,
    intro: `Ushbu hujjat ${COMPANY.name} tomonidan taqdim etilayotgan xizmatlardan foydalanish bo'yicha ommaviy taklif (oferta) hisoblanadi.`,
    sections: [
      {
        heading: "Oferta predmeti",
        body: [
          "Ijrochi foydalanuvchiga AI yordamida marketplace uchun grafik kontent yaratish xizmatini taqdim etadi.",
          "Xizmat token tizimi orqali ko'rsatiladi: foydalanuvchi tokenlarni sotib oladi va ularni generatsiyaga sarflaydi.",
        ],
      },
      {
        heading: "Akseptlash tartibi",
        body: [
          "Ro'yxatdan o'tish va xizmatdan foydalanishni boshlash ushbu ofertani to'liq qabul qilish (aksept) deb hisoblanadi.",
          "Aksept paytidan boshlab foydalanuvchi va Ijrochi o'rtasida shartnoma tuzilgan hisoblanadi.",
        ],
      },
      {
        heading: "Narx va to'lov",
        body: [
          "Amaldagi tariflar «Tokenlar va tariflar» bo'limida ko'rsatilgan va Ijrochi tomonidan bir tomonlama o'zgartirilishi mumkin.",
          "Allaqachon sotib olingan tokenlarga yangi tariflar ta'sir qilmaydi.",
        ],
      },
      {
        heading: "Qaytarish shartlari",
        body: [
          "Sarflanmagan tokenlar sotib olingan kundan 14 kun ichida qaytarilishi mumkin.",
          "Generatsiyaga sarflangan tokenlar qaytarilmaydi, chunki xizmat allaqachon ko'rsatilgan.",
          "Texnik xatolik tufayli bajarilmagan generatsiya uchun tokenlar avtomatik qaytariladi.",
        ],
      },
      {
        heading: "Rekvizitlar",
        body: [
          `${COMPANY.name} · ${COMPANY.site}`,
          `Email: ${COMPANY.email} · Telegram: ${COMPANY.telegram}`,
        ],
      },
    ],
  },
};

const ru: Record<LegalDoc, LegalPage> = {
  privacy: {
    title: "Политика конфиденциальности",
    updated: COMPANY.updated,
    intro: `Документ объясняет, какие данные собирает сервис ${COMPANY.site} и как они используются.`,
    sections: [
      {
        heading: "Какие данные собираются",
        body: [
          "Данные аккаунта: имя, email, язык интерфейса, код поддержки.",
          "Загруженные вами фотографии товара и настройки генерации (название, категория, преимущества).",
          "Технические данные: время запросов, логи ошибок, история операций с токенами.",
        ],
      },
      {
        heading: "Зачем используются данные",
        body: [
          "Чтобы выполнить генерацию изображения и вернуть вам результат.",
          "Чтобы вести баланс токенов и показывать историю операций.",
          "Чтобы улучшать качество сервиса, находить ошибки и оказывать поддержку.",
        ],
      },
      {
        heading: "Третьи стороны",
        body: [
          "Генерация изображений выполняется через внешнего AI-провайдера (OpenAI) — загруженное фото и текстовый бриф передаются этому сервису.",
          "Ваши данные не продаются в рекламных целях и не передаются третьим лицам.",
        ],
      },
      {
        heading: "Срок хранения и удаление",
        body: [
          "Проекты и результаты генерации хранятся, пока аккаунт активен.",
          `Чтобы удалить аккаунт и все данные, напишите на ${COMPANY.telegram} — запрос выполняется в течение 30 дней.`,
        ],
      },
      {
        heading: "Контакты",
        body: [`По вопросам: ${COMPANY.email} или Telegram ${COMPANY.telegram}.`],
      },
    ],
  },
  terms: {
    title: "Условия использования",
    updated: COMPANY.updated,
    intro: `Используя сервис ${COMPANY.site}, вы соглашаетесь с условиями ниже.`,
    sections: [
      {
        heading: "Что делает сервис",
        body: [
          "Сервис создаёт карточки, инфографику и креативы для маркетплейсов на основе загруженных вами фотографий товара.",
          "Результат создаётся искусственным интеллектом, поэтому каждая генерация уникальна и не воспроизводится точно.",
        ],
      },
      {
        heading: "Обязанности пользователя",
        body: [
          "Вы гарантируете, что имеете права на загружаемые фотографии.",
          "Запрещено загружать логотипы чужих брендов, контрафакт и товары, оборот которых ограничен законом.",
          "Вы самостоятельно проверяете достоверность текстов на результате (преимущества, характеристики) — сервис не отвечает за описание товара.",
        ],
      },
      {
        heading: "Токены",
        body: [
          "Каждая генерация списывает токены. Стоимость зависит от типа генерации, количества вариантов и страниц.",
          "Токены списываются в момент приёма запроса сервером. При технической ошибке они возвращаются автоматически.",
          "Токены не обмениваются обратно на деньги и не переводятся на другой аккаунт.",
        ],
      },
      {
        heading: "Права на результат",
        body: [
          "Вы можете использовать созданные изображения в коммерческих целях без ограничений — для карточек, рекламы, соцсетей.",
          "Сервис не гарантирует соответствие результата правилам конкретного маркетплейса: у каждой площадки свои требования.",
        ],
      },
      {
        heading: "Ограничения",
        body: [
          "Сервис предоставляется «как есть». Ответственность за перебои, сбои на стороне AI-провайдера и качество результата ограничена.",
          "Аккаунт, нарушающий условия, может быть заблокирован без предупреждения.",
        ],
      },
    ],
  },
  offer: {
    title: "Публичная оферта",
    updated: COMPANY.updated,
    intro: `Настоящий документ является публичным предложением (офертой) ${COMPANY.name} на оказание услуг.`,
    sections: [
      {
        heading: "Предмет оферты",
        body: [
          "Исполнитель оказывает услугу создания графического контента для маркетплейсов с помощью AI.",
          "Услуга оказывается через систему токенов: пользователь приобретает токены и расходует их на генерации.",
        ],
      },
      {
        heading: "Порядок акцепта",
        body: [
          "Регистрация и начало использования сервиса считаются полным принятием (акцептом) настоящей оферты.",
          "С момента акцепта между пользователем и Исполнителем считается заключённым договор.",
        ],
      },
      {
        heading: "Цена и оплата",
        body: [
          "Действующие тарифы указаны в разделе «Токены и тарифы» и могут изменяться Исполнителем в одностороннем порядке.",
          "Новые тарифы не распространяются на уже приобретённые токены.",
        ],
      },
      {
        heading: "Условия возврата",
        body: [
          "Неизрасходованные токены можно вернуть в течение 14 дней с даты покупки.",
          "Токены, потраченные на генерацию, возврату не подлежат — услуга уже оказана.",
          "За генерацию, не выполненную из-за технической ошибки, токены возвращаются автоматически.",
        ],
      },
      {
        heading: "Реквизиты",
        body: [
          `${COMPANY.name} · ${COMPANY.site}`,
          `Email: ${COMPANY.email} · Telegram: ${COMPANY.telegram}`,
        ],
      },
    ],
  },
};

export const LEGAL_CONTENT: Record<"uz" | "ru", Record<LegalDoc, LegalPage>> = { uz, ru };
