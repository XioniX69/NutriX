/* =========================================================================
   NUTRIX — src/math.js
   Константы, научное ядро КБЖУ, сырой/готовый вес, парсер ограничений,
   EMA-тренд Check-In и утилиты дат/безопасности.
   ========================================================================= */

export const WEEK_DAYS = [
    { short: "Пн", full: "Понедельник" },
    { short: "Вт", full: "Вторник" },
    { short: "Ср", full: "Среда" },
    { short: "Чт", full: "Четверг" },
    { short: "Пт", full: "Пятница" },
    { short: "Сб", full: "Суббота" },
    { short: "Вс", full: "Воскресенье" }
];

export const MAX_SAVED_CUSTOM_MEALS = 30;

export const NUTRIX_THEMES = [
    { id: "auto",     name: "Авто",    sub: "Как в Telegram", bg: "linear-gradient(135deg, #0B0D0C 50%, #F3F6F4 50%)", accent: "#4BD07D" },
    { id: "obsidian", name: "Тёмная",  sub: "Obsidian",       bg: "#0B0D0C", accent: "#4BD07D" },
    { id: "daylight", name: "Светлая", sub: "Daylight",       bg: "#F3F6F4", accent: "#1FA855" }
];

export const ACTIVITY_LEVEL_TIERS = {
    1:  { title: "Сидячий режим",          desc: "Менее 3 000 шагов в день, учёба или работа за ПК без тренировок" },
    2:  { title: "Низкая активность",      desc: "3–5 тыс. шагов, редкие прогулки, без регулярного спорта" },
    3:  { title: "Лёгкий тонус",           desc: "5–7 тыс. шагов, зарядка или 1 лёгкая тренировка в неделю" },
    4:  { title: "Умеренная подвижность",  desc: "7–9 тыс. шагов + 1–2 тренировки в неделю" },
    5:  { title: "Базовый фитнес",         desc: "8–10 тыс. шагов и 2–3 полноценные тренировки в неделю" },
    6:  { title: "Уверенный атлет",        desc: "3–4 интенсивные силовые или игровые тренировки в неделю" },
    7:  { title: "Высокая нагрузка",       desc: "4–5 тяжёлых тренировок в неделю + высокая дневная ходьба" },
    8:  { title: "Интенсивный спорт",      desc: "5–6 тренировок в неделю, совмещение зала и кардио/игр" },
    9:  { title: "Полупрофи",              desc: "Ежедневные интенсивные тренировки и высокий общий объём" },
    10: { title: "Экстремальная нагрузка", desc: "Двухразовые тренировки или тяжёлый физический труд" }
};

export const SPORT_PROFILES = {
    none:      { title: "Не занимаюсь спортом", short: "Без спорта",   sub: "Обычная домашняя еда, комфортный белок (1.3–1.6 г/кг) без спортпита", pBase: 1.35, pCut: 1.60, pBulk: 1.55, fatKg: 1.00, minFatPct: 0.25, avoidSupps: true },
    fitness:   { title: "Фитнес / Йога / Тонус", short: "Фитнес",      sub: "Поддержание формы и лёгкие тренировки: 1.6–1.85 г/кг белка",         pBase: 1.60, pCut: 1.85, pBulk: 1.75, fatKg: 0.95, minFatPct: 0.23, avoidSupps: false },
    strength:  { title: "Силовые / Тренажёрный зал", short: "Силовые", sub: "Гипертрофия и сила: 2.0–2.25 г/кг белка + стабильный гликоген",      pBase: 2.00, pCut: 2.25, pBulk: 2.05, fatKg: 0.95, minFatPct: 0.20, avoidSupps: false },
    team:      { title: "Игровые (волейбол, футбол…)", short: "Игровые", sub: "Взрывная выносливость: 1.8–2.05 г/кг белка + упор на углеводы",    pBase: 1.80, pCut: 2.05, pBulk: 1.90, fatKg: 0.90, minFatPct: 0.20, avoidSupps: false },
    endurance: { title: "Выносливость (бег, вело, плав.)", short: "Выносл.", sub: "Максимум сложных углеводов (55–63%) и 1.6–1.85 г/кг белка",    pBase: 1.60, pCut: 1.85, pBulk: 1.70, fatKg: 0.85, minFatPct: 0.20, avoidSupps: false },
    combat:    { title: "Единоборства / Кроссфит", short: "Единобор.", sub: "Интенсивные нагрузки: 1.95–2.2 г/кг белка + плотный энергообмен",    pBase: 1.95, pCut: 2.20, pBulk: 2.00, fatKg: 0.90, minFatPct: 0.20, avoidSupps: false }
};

export const GOALS_V4 = [
    { val: "healthy",  title: "Просто здоровое питание", sub: "Сбалансированный рацион, энергия, клетчатка и полезные жиры без строгих диет" },
    { val: "cut",      title: "Похудение / Сушка",       sub: "Умеренный дефицит −15..22% ккал + высокий белок для защиты мышц" },
    { val: "maintain", title: "Поддержание формы",       sub: "Ровный баланс 0% ккал для стабильного веса и рекомпозиции" },
    { val: "bulk",     title: "Набор мышечной массы",    sub: "Контролируемый профицит +10..15% для качественного роста мышц" }
];

export const APPETITE_LEVELS = {
    1: { title: "Очень низкий", startFactor: 0.82, sub: "Сложно доедать порции — начнём с 82% и плавно раскачаем (+90 ккал / 4 дня) через плотные блюда." },
    2: { title: "Сниженный",    startFactor: 0.88, sub: "Быстро наедаюсь — старт с 88% и мягкий выход на норму." },
    3: { title: "Нормальный",   startFactor: 1.00, sub: "Комфортный аппетит — сразу выходим на расчётную суточную норму." },
    4: { title: "Повышенный",   startFactor: 1.00, sub: "Люблю сытные порции — приоритет объёмным блюдам с высоким индексом сытости." },
    5: { title: "Очень высокий",startFactor: 1.00, sub: "Максимум белка, овощей и клетчатки для долгого чувства сытости." }
};

export const EXCLUSION_SYNONYMS = {
    lactose: {
        triggers: ["лактоз", "молоч", "молок", "творог", "сыр", "кефир", "йогурт", "сметан", "ряженк", "сливк"],
        blockPatterns: [/лактоз/i, /молоч/i, /молок(?!о миндал|о овсян|о кокос|о соев)/i, /творог/i, /сыр(?!оед|ой)/i, /йогурт(?! соев| кокос)/i, /кефир/i, /ряженк/i, /сметан/i, /простокваш/i, /рикотт/i, /моцарелл/i, /пармезан/i, /скир/i, /халуми/i, /страчателл/i, /сливк/i],
        allowIfContains: [/безлактоз/i, /без лактоз/i]
    },
    gluten: {
        triggers: ["глютен", "пшениц", "мучн", "хлеб", "макарон"],
        blockPatterns: [/глютен/i, /пшенич/i, /булгур/i, /кускус/i, /полб/i, /перлов/i, /ячнев/i, /ржан/i, /макарон/i, /паста(?! арахис| миндал| тахин| из красн| из зелён)/i, /тортиль/i, /хлеб(?!цы греч)/i],
        allowIfContains: [/без глютен/i, /безглютен/i, /\(бг\)/i]
    },
    fish: {
        triggers: ["рыб", "лосос", "форел", "тунец", "минтай", "треск", "скумбр", "сайр", "горбуш"],
        blockPatterns: [/рыб/i, /форел/i, /лосос/i, /сёмг/i, /семг/i, /кижуч/i, /нерк/i, /горбуш/i, /судак/i, /тунец/i, /тунц/i, /треск/i, /минта/i, /хек/i, /сибас/i, /дорад/i, /палтус/i, /камбал/i, /скумбр/i, /сайр/i, /муксун/i, /чир/i]
    },
    seafood: {
        triggers: ["морепрод", "кревет", "кальмар", "краб", "осьминог", "миди", "гребеш"],
        blockPatterns: [/морепрод/i, /кревет/i, /кальмар/i, /миди/i, /гребеш/i, /осьминог/i, /краб/i]
    },
    nuts: {
        triggers: ["орех", "арахис", "миндал", "кешью", "фисташ", "пекан", "фундук", "кедров"],
        blockPatterns: [/орех/i, /миндал/i, /грецк/i, /кешью/i, /арахис/i, /фундук/i, /фисташ/i, /пекан/i, /кедров/i]
    },
    eggs: {
        triggers: ["яйц", "яич", "омлет"],
        blockPatterns: [/яйц/i, /яич/i, /омлет/i]
    },
    pork: {
        triggers: ["свинин", "бекон", "ветчин"],
        blockPatterns: [/свин/i, /бекон/i, /ветчин/i]
    },
    mushrooms: {
        triggers: ["гриб", "шампиньон", "вешенк"],
        blockPatterns: [/гриб/i, /шампиньон/i, /вешенк/i, /лисичк/i]
    },
    cottage: {
        triggers: ["творог", "творож"],
        blockPatterns: [/творог/i, /творож/i]
    },
    soy: {
        triggers: ["соя", "соев", "тофу", "эдамаме", "тамари"],
        blockPatterns: [/соя/i, /соев/i, /тофу/i, /эдамаме/i, /тамари/i]
    },
    vegetarian: {
        triggers: ["вегетар", "без мяс", "мяс"],
        blockPatterns: [/курин/i, /куриц/i, /индейк/i, /говяд/i, /телят/i, /кролик/i, /утин/i, /утк/i, /свин/i, /печен/i, /сердц/i, /сердеч/i, /желуд/i, /язык/i, /фарш/i, /рыб/i, /форел/i, /лосос/i, /сёмг/i, /кижуч/i, /горбуш/i, /судак/i, /тунец/i, /тунц/i, /треск/i, /минта/i, /хек/i, /сибас/i, /дорад/i, /палтус/i, /камбал/i, /скумбр/i, /сайр/i, /муксун/i, /кревет/i, /кальмар/i, /гребеш/i, /осьминог/i, /краб/i]
    },
    vegan: {
        triggers: ["веган"],
        blockPatterns: [/курин/i, /куриц/i, /индейк/i, /говяд/i, /телят/i, /кролик/i, /утк/i, /печен/i, /сердц/i, /желуд/i, /язык/i, /фарш/i, /рыб/i, /форел/i, /лосос/i, /сёмг/i, /горбуш/i, /судак/i, /тунец/i, /треск/i, /минта/i, /хек/i, /скумбр/i, /сайр/i, /кревет/i, /кальмар/i, /краб/i, /яйц/i, /яич/i, /молок(?!о миндал|о овсян|о кокос|о соев)/i, /творог/i, /сыр(?!оед|ой)/i, /йогурт(?! соев| кокос)/i, /кефир/i, /ряженк/i, /сметан/i, /рикотт/i, /моцарелл/i, /пармезан/i, /скир/i, /сывороточ/i]
    }
};

export const EMBEDDED_MASTER_V4 = [
            {
                recipe_id: "RCP-00001", title_ru: "Овсяная каша долгой варки с голубикой, миндалём и семенами чиа",
                short_description: "Медленные углеводы, клетчатка и антиоксиданты для ровной утренней энергии.",
                primary_category_ru: "Овсяные каши", meal_type: "Завтрак", cuisine: "Скандинавская",
                prep_time_min: 5, cook_time_min: 12, total_time_min: 17, cooking_temperature_c: 95, shelf_life_hours: 48,
                goal_tags_ru: ["Поддержание веса", "Набор мышечной массы", "Сбалансированное питание"],
                dietary_tags_ru: ["Без сахара", "Без глютена", "Вегетарианское", "Высокое содержание клетчатки"],
                allergens_ru: ["Лактоза", "Орехи"],
                serving_recommendation: "Оптимально за 60–90 мин до нагрузки или как сытный базовый завтрак.",
                nutrition: { raw_total_weight_g: 368, cooked_total_weight_g: 339, serving_weight_g: 339, serving_kcal: 499, serving_protein_g: 22.7, serving_fat_g: 19.4, serving_carbs_g: 61.9, serving_fiber_g: 13.9 },
                ingredients: [
                    { name: "Овсяные хлопья долгой варки", amount_g: 65, state: "сырой", dept: "Бакалея и крупы", yieldFactor: 1.0, alt: "Зелёная гречка, хлопья киноа" },
                    { name: "Молоко миндальное без сахара", amount_g: 180, state: "сырой", dept: "Растительные и спорт-продукты", yieldFactor: 1.0, alt: "Молоко 1.5%, овсяное молоко" },
                    { name: "Творог рассыпчатый 2%", amount_g: 40, state: "сырой", dept: "Молочные продукты и яйца", yieldFactor: 1.0, alt: "Творог безлактозный 1.8%" },
                    { name: "Голубика садовая свежая", amount_g: 55, state: "свежий", dept: "Овощи, фрукты и зелень", yieldFactor: 1.0, alt: "Малина, клубника" },
                    { name: "Миндаль цельный необжаренный", amount_g: 18, state: "свежий", dept: "Орехи, масла и соусы", yieldFactor: 1.0, alt: "Грецкий орех, тыквенные семечки" },
                    { name: "Семена чиа", amount_g: 10, state: "свежий", dept: "Орехи, масла и соусы", yieldFactor: 1.0, alt: "Семена льна" }
                ],
                steps_structured: [
                    { step_number: 1, stage_name: "Варка основы", duration_min: 12, temperature_c: 95, instruction: "Варите овсяные хлопья в молоке с семенами чиа при 95 °C до кремовой текстуры." },
                    { step_number: 2, stage_name: "Подача", duration_min: 3, temperature_c: 65, instruction: "Вмешайте творог, добавьте свежую голубику и цельный миндаль." }
                ]
            },
            {
                recipe_id: "RCP-00055", title_ru: "Творожно-овсяная запеканка с бананом, арахисовой пастой и какао",
                short_description: "Высокобелковый завтрак без сахара, который удобно заготовить с вечера.",
                primary_category_ru: "Запеканки", meal_type: "Завтрак", cuisine: "Фитнес-кухня",
                prep_time_min: 8, cook_time_min: 25, total_time_min: 33, cooking_temperature_c: 180, shelf_life_hours: 48,
                goal_tags_ru: ["Набор мышечной массы", "Поддержание веса", "Спортивное питание"],
                dietary_tags_ru: ["Без сахара", "Без глютена", "Вегетарианское"],
                allergens_ru: ["Лактоза", "Яйца", "Арахис"],
                serving_recommendation: "Ровное поступление аминокислот на 4 часа вперёд.",
                nutrition: { raw_total_weight_g: 404, cooked_total_weight_g: 356, serving_weight_g: 356, serving_kcal: 541, serving_protein_g: 51.7, serving_fat_g: 17.3, serving_carbs_g: 52.0, serving_fiber_g: 9.1 },
                ingredients: [
                    { name: "Творог рассыпчатый 2%", amount_g: 150, state: "сырой", dept: "Молочные продукты и яйца", yieldFactor: 1.0, alt: "Творог безлактозный 1.8%" },
                    { name: "Белок куриного яйца", amount_g: 80, state: "сырой", dept: "Молочные продукты и яйца", yieldFactor: 0.92, alt: "Цельное яйцо" },
                    { name: "Овсяные хлопья долгой варки", amount_g: 30, state: "сырой", dept: "Бакалея и крупы", yieldFactor: 1.0, alt: "Рисовая мука" },
                    { name: "Йогурт греческий натуральный 2%", amount_g: 40, state: "сырой", dept: "Молочные продукты и яйца", yieldFactor: 1.0, alt: "Скир 0.5%" },
                    { name: "Банан спелый очищенный", amount_g: 70, state: "свежий", dept: "Овощи, фрукты и зелень", yieldFactor: 1.0, alt: "Яблоко, груша" },
                    { name: "Арахисовая паста 100% без сахара", amount_g: 20, state: "сырой", dept: "Орехи, масла и соусы", yieldFactor: 1.0, alt: "Миндальная паста" }
                ],
                steps_structured: [
                    { step_number: 1, stage_name: "Смешивание", duration_min: 5, temperature_c: 20, instruction: "Пробейте блендером творог, яичный белок, хлопья, йогурт и половину банана." },
                    { step_number: 2, stage_name: "Запекание", duration_min: 25, temperature_c: 180, instruction: "Выпекайте в форме 25 минут при 180 °C, подавайте с оставшимся бананом и арахисовой пастой." }
                ]
            },
            {
                recipe_id: "RCP-00091", title_ru: "Белковый тост на цельнозерновом хлебе с яйцом пашот, рикоттой и шпинатом",
                short_description: "Быстрый и сытный завтрак за 11 минут из доступных продуктов.",
                primary_category_ru: "Тосты и сэндвичи", meal_type: "Завтрак", cuisine: "Итальянская",
                prep_time_min: 7, cook_time_min: 4, total_time_min: 11, cooking_temperature_c: 170, shelf_life_hours: 12,
                goal_tags_ru: ["Поддержание веса", "Сбалансированное питание", "Похудение"],
                dietary_tags_ru: ["Без сахара", "Вегетарианское"],
                allergens_ru: ["Глютен", "Лактоза", "Яйца"],
                serving_recommendation: "Сбалансированный старт дня за 11 минут.",
                nutrition: { raw_total_weight_g: 315, cooked_total_weight_g: 277, serving_weight_g: 277, serving_kcal: 444, serving_protein_g: 31.8, serving_fat_g: 20.7, serving_carbs_g: 33.5, serving_fiber_g: 6.2 },
                ingredients: [
                    { name: "Хлеб цельнозерновой ржано-пшеничный", amount_g: 65, state: "свежий", dept: "Бакалея и крупы", yieldFactor: 1.0, alt: "Хлебцы гречневые" },
                    { name: "Сыр Рикотта Лайт 9%", amount_g: 45, state: "сырой", dept: "Молочные продукты и яйца", yieldFactor: 1.0, alt: "Творог мягкий 2%" },
                    { name: "Яйцо куриное цельное", amount_g: 55, state: "варёный", dept: "Молочные продукты и яйца", yieldFactor: 0.98, alt: "Перепелиные яйца" },
                    { name: "Шпинат молодой листовой", amount_g: 45, state: "свежий", dept: "Овощи, фрукты и зелень", yieldFactor: 1.0, alt: "Руккола" },
                    { name: "Томаты черри спелые", amount_g: 65, state: "свежий", dept: "Овощи, фрукты и зелень", yieldFactor: 1.0, alt: "Свежий огурец" },
                    { name: "Сыр Моцарелла Лайт 15%", amount_g: 35, state: "сырой", dept: "Молочные продукты и яйца", yieldFactor: 1.0, alt: "Сыр Адыгейский" }
                ],
                steps_structured: [
                    { step_number: 1, stage_name: "Основа и яйцо", duration_min: 5, temperature_c: 170, instruction: "Подсушите хлеб в тостере и отварите яйцо всмятку или пашот." },
                    { step_number: 2, stage_name: "Сборка", duration_min: 3, temperature_c: 20, instruction: "Намажьте рикотту, выложите шпинат, томаты, моцареллу и яйцо." }
                ]
            },
            {
                recipe_id: "RCP-00101", title_ru: "Запечённое филе куриной грудки с отварной гречкой и брокколи",
                short_description: "Базовый чистый обед без аллергенов: постный белок и сложные углеводы.",
                primary_category_ru: "Курица с гарнирами", meal_type: "Обед", cuisine: "Домашняя",
                prep_time_min: 8, cook_time_min: 20, total_time_min: 28, cooking_temperature_c: 190, shelf_life_hours: 48,
                goal_tags_ru: ["Похудение", "Поддержание веса", "Набор мышечной массы", "Сбалансированное питание"],
                dietary_tags_ru: ["Без сахара", "Без глютена", "Без лактозы"],
                allergens_ru: [],
                serving_recommendation: "Удобно запекать сразу на 2 дня; отлично восстанавливает гликоген.",
                nutrition: { raw_total_weight_g: 411, cooked_total_weight_g: 362, serving_weight_g: 362, serving_kcal: 365, serving_protein_g: 41.0, serving_fat_g: 8.5, serving_carbs_g: 31.0, serving_fiber_g: 5.5 },
                ingredients: [
                    { name: "Куриная грудка (филе)", amount_g: 155, state: "запечённый", dept: "Мясо и птица", yieldFactor: 0.78, alt: "Филе грудки индейки" },
                    { name: "Гречневая крупа ядрица (отварная)", amount_g: 150, state: "варёный", dept: "Бакалея и крупы", yieldFactor: 2.5, alt: "Киноа, бурый рис" },
                    { name: "Брокколи соцветия", amount_g: 100, state: "запечённый", dept: "Овощи, фрукты и зелень", yieldFactor: 0.85, alt: "Цветная капуста, стручковая фасоль" },
                    { name: "Масло оливковое Extra Virgin", amount_g: 6, state: "сырой", dept: "Орехи, масла и соусы", yieldFactor: 1.0, alt: "Масло авокадо" }
                ],
                steps_structured: [
                    { step_number: 1, stage_name: "Запекание и гарнир", duration_min: 20, temperature_c: 190, instruction: "Запеките филе грудки в травах 20 минут при 190 °C; отварите гречку и припустите брокколи." },
                    { step_number: 2, stage_name: "Подача", duration_min: 2, temperature_c: 65, instruction: "Подайте с оливковым маслом холодного отжима." }
                ]
            },
            {
                recipe_id: "RCP-01664", title_ru: "Запечённая грудка индейки с булгуром, семенами конопли и свежим шпинатом",
                short_description: "Высокобелковый обед Партии №4 с богатым профилем клетчатки и омега-жиров.",
                primary_category_ru: "Высокобелковые блюда", meal_type: "Обед", cuisine: "Средиземноморская",
                prep_time_min: 8, cook_time_min: 20, total_time_min: 28, cooking_temperature_c: 185, shelf_life_hours: 48,
                goal_tags_ru: ["Набор мышечной массы", "Поддержание веса", "Спортивное питание"],
                dietary_tags_ru: ["Без сахара", "Без лактозы", "Высокое содержание клетчатки"],
                allergens_ru: ["Глютен"],
                serving_recommendation: "Идеален в тренировочный день для закрытия нормы белка и углеводов.",
                nutrition: { raw_total_weight_g: 431, cooked_total_weight_g: 392, serving_weight_g: 392, serving_kcal: 606, serving_protein_g: 67.8, serving_fat_g: 12.3, serving_carbs_g: 59.5, serving_fiber_g: 11.1 },
                ingredients: [
                    { name: "Филе грудки индейки", amount_g: 175, state: "запечённый", dept: "Мясо и птица", yieldFactor: 0.78, alt: "Куриная грудка (филе)" },
                    { name: "Булгур из твёрдой пшеницы (отварной)", amount_g: 185, state: "варёный", dept: "Бакалея и крупы", yieldFactor: 2.5, alt: "Гречневая крупа ядрица, киноа" },
                    { name: "Семена конопли очищенные", amount_g: 16, state: "сырой", dept: "Орехи, масла и соусы", yieldFactor: 1.0, alt: "Семена тыквы" },
                    { name: "Шпинат молодой листовой", amount_g: 55, state: "свежий", dept: "Овощи, фрукты и зелень", yieldFactor: 1.0, alt: "Руккола" }
                ],
                steps_structured: [
                    { step_number: 1, stage_name: "Запекание индейки", duration_min: 20, temperature_c: 185, instruction: "Запеките филе индейки в пергаменте 20 минут при 185 °C." },
                    { step_number: 2, stage_name: "Сборка", duration_min: 3, temperature_c: 65, instruction: "Выложите слайсы индейки на отварной булгур со свежим шпинатом и семенами." }
                ]
            },
            {
                recipe_id: "RCP-00145", title_ru: "Припущенные королевские креветки в пряном соусе с булгуром и овощами",
                short_description: "Лёгкий и яркий обед за 18 минут с минимумом насыщенных жиров.",
                primary_category_ru: "Морепродукты", meal_type: "Обед", cuisine: "Ближневосточная",
                prep_time_min: 8, cook_time_min: 10, total_time_min: 18, cooking_temperature_c: 120, shelf_life_hours: 24,
                goal_tags_ru: ["Похудение", "Поддержание веса", "Сбалансированное питание"],
                dietary_tags_ru: ["Без сахара", "Без лактозы"],
                allergens_ru: ["Глютен", "Морепродукты"],
                serving_recommendation: "Богатый источник йода, селена и быстроусвояемого белка.",
                nutrition: { raw_total_weight_g: 465, cooked_total_weight_g: 428, serving_weight_g: 428, serving_kcal: 342, serving_protein_g: 34.0, serving_fat_g: 7.5, serving_carbs_g: 34.5, serving_fiber_g: 5.2 },
                ingredients: [
                    { name: "Креветки королевские очищенные", amount_g: 170, state: "варёный", dept: "Рыба и морепродукты", yieldFactor: 0.74, alt: "Филе командорского кальмара" },
                    { name: "Булгур из твёрдой пшеницы (отварной)", amount_g: 150, state: "варёный", dept: "Бакалея и крупы", yieldFactor: 2.5, alt: "Киноа, рис басмати" },
                    { name: "Перец сладкий болгарский", amount_g: 70, state: "свежий", dept: "Овощи, фрукты и зелень", yieldFactor: 1.0, alt: "Томаты черри" },
                    { name: "Шампиньоны свежие", amount_g: 75, state: "запечённый", dept: "Овощи, фрукты и зелень", yieldFactor: 0.85, alt: "Цукини" },
                    { name: "Масло оливковое Extra Virgin", amount_g: 8, state: "сырой", dept: "Орехи, масла и соусы", yieldFactor: 1.0, alt: "Масло авокадо" }
                ],
                steps_structured: [
                    { step_number: 1, stage_name: "Овощи и креветки", duration_min: 10, temperature_c: 120, instruction: "Припустите шампиньоны и перец на сковороде, добавьте креветки с лимоном на 3–4 минуты." },
                    { step_number: 2, stage_name: "Подача", duration_min: 2, temperature_c: 65, instruction: "Соедините с тёплым отварным булгуром." }
                ]
            },
            {
                recipe_id: "RCP-02000", title_ru: "Говяжьи биточки 5% на пару с перловкой и печёными шампиньонами",
                short_description: "Сытный классический обед Партии №4 с гемовым железом и бета-глюканами.",
                primary_category_ru: "Мясные блюда", meal_type: "Обед", cuisine: "Домашняя",
                prep_time_min: 8, cook_time_min: 18, total_time_min: 26, cooking_temperature_c: 185, shelf_life_hours: 48,
                goal_tags_ru: ["Набор мышечной массы", "Поддержание веса", "Сбалансированное питание"],
                dietary_tags_ru: ["Без сахара", "Без лактозы", "Высокое содержание клетчатки"],
                allergens_ru: ["Глютен"],
                serving_recommendation: "Отличный выбор в дни тяжёлых силовых тренировок.",
                nutrition: { raw_total_weight_g: 362, cooked_total_weight_g: 329, serving_weight_g: 329, serving_kcal: 511, serving_protein_g: 45.2, serving_fat_g: 16.6, serving_carbs_g: 45.6, serving_fiber_g: 9.7 },
                ingredients: [
                    { name: "Фарш говяжий постный 5%", amount_g: 130, state: "варёный", dept: "Мясо и птица", yieldFactor: 0.74, alt: "Фарш из индейки, телятина" },
                    { name: "Перловая крупа (отварная)", amount_g: 135, state: "варёный", dept: "Бакалея и крупы", yieldFactor: 2.5, alt: "Гречневая крупа, рис бурый" },
                    { name: "Шампиньоны свежие", amount_g: 80, state: "запечённый", dept: "Овощи, фрукты и зелень", yieldFactor: 0.85, alt: "Брокколи" },
                    { name: "Масло оливковое Extra Virgin", amount_g: 7, state: "сырой", dept: "Орехи, масла и соусы", yieldFactor: 1.0, alt: "Подсолнечное нерафинированное" }
                ],
                steps_structured: [
                    { step_number: 1, stage_name: "Приготовление", duration_min: 18, temperature_c: 185, instruction: "Сформуйте биточки из постного фарша, приготовьте на пару или запеките с шампиньонами 18 минут." },
                    { step_number: 2, stage_name: "Подача", duration_min: 2, temperature_c: 65, instruction: "Подавайте с отварной перловкой и оливковым маслом." }
                ]
            },
            {
                recipe_id: "RCP-00223", title_ru: "Запечённая радужная форель с цукини-гриль, перцем и рукколой",
                short_description: "Лёгкий вечерний источник Омега-3 без глютена и лактозы.",
                primary_category_ru: "Рыба с овощами", meal_type: "Ужин", cuisine: "Средиземноморская",
                prep_time_min: 8, cook_time_min: 16, total_time_min: 24, cooking_temperature_c: 180, shelf_life_hours: 24,
                goal_tags_ru: ["Похудение", "Поддержание веса", "Сбалансированное питание"],
                dietary_tags_ru: ["Без сахара", "Без глютена", "Без лактозы"],
                allergens_ru: ["Рыба"],
                serving_recommendation: "Ускоряет восстановление после нагрузок и не перегружает ЖКТ перед сном.",
                nutrition: { raw_total_weight_g: 430, cooked_total_weight_g: 378, serving_weight_g: 378, serving_kcal: 315, serving_protein_g: 34.0, serving_fat_g: 15.0, serving_carbs_g: 11.0, serving_fiber_g: 3.5 },
                ingredients: [
                    { name: "Филе радужной форели", amount_g: 185, state: "запечённый", dept: "Рыба и морепродукты", yieldFactor: 0.78, alt: "Горбуша тихоокеанская (филе)" },
                    { name: "Цукини (молодой кабачок)", amount_g: 120, state: "запечённый", dept: "Овощи, фрукты и зелень", yieldFactor: 0.85, alt: "Брокколи" },
                    { name: "Перец сладкий болгарский", amount_g: 75, state: "свежий", dept: "Овощи, фрукты и зелень", yieldFactor: 1.0, alt: "Томаты черри" },
                    { name: "Руккола свежая салатная", amount_g: 30, state: "свежий", dept: "Овощи, фрукты и зелень", yieldFactor: 1.0, alt: "Шпинат молодой" },
                    { name: "Масло оливковое Extra Virgin", amount_g: 5, state: "сырой", dept: "Орехи, масла и соусы", yieldFactor: 1.0, alt: "Масло авокадо" }
                ],
                steps_structured: [
                    { step_number: 1, stage_name: "Запекание", duration_min: 16, temperature_c: 180, instruction: "Запеките форель с цукини и перцем 16 минут при 180 °C." },
                    { step_number: 2, stage_name: "Подача", duration_min: 2, temperature_c: 60, instruction: "Подайте на подушке из свежей рукколы с каплей лимона." }
                ]
            },
            {
                recipe_id: "RCP-02054", title_ru: "Запечённая куриная грудка с «рисом» из цветной капусты и зеленью",
                short_description: "Лёгкий и объёмный ужин Партии №4 с высокой плотностью белка.",
                primary_category_ru: "Низкоуглеводные блюда", meal_type: "Ужин", cuisine: "Домашняя",
                prep_time_min: 7, cook_time_min: 16, total_time_min: 23, cooking_temperature_c: 185, shelf_life_hours: 48,
                goal_tags_ru: ["Похудение", "Поддержание веса", "Сбалансированное питание"],
                dietary_tags_ru: ["Без сахара", "Без глютена", "Без лактозы"],
                allergens_ru: [],
                serving_recommendation: "Сытный объём без тяжёлой углеводной нагрузки на ночь.",
                nutrition: { raw_total_weight_g: 420, cooked_total_weight_g: 378, serving_weight_g: 378, serving_kcal: 386, serving_protein_g: 47.0, serving_fat_g: 13.8, serving_carbs_g: 18.5, serving_fiber_g: 6.4 },
                ingredients: [
                    { name: "Куриная грудка (филе)", amount_g: 190, state: "запечённый", dept: "Мясо и птица", yieldFactor: 0.78, alt: "Филе грудки индейки" },
                    { name: "Цветная капуста соцветия", amount_g: 165, state: "запечённый", dept: "Овощи, фрукты и зелень", yieldFactor: 0.85, alt: "Брокколи соцветия" },
                    { name: "Масло оливковое Extra Virgin", amount_g: 8, state: "сырой", dept: "Орехи, масла и соусы", yieldFactor: 1.0, alt: "Масло авокадо" }
                ],
                steps_structured: [
                    { step_number: 1, stage_name: "Подготовка", duration_min: 5, temperature_c: 20, instruction: "Измельчите цветную капусту до мелкой крошки и замаринуйте филе со специями." },
                    { step_number: 2, stage_name: "Запекание", duration_min: 16, temperature_c: 185, instruction: "Запеките грудку и капустный «рис» с оливковым маслом 16 минут при 185 °C." }
                ]
            },
            {
                recipe_id: "RCP-01600", title_ru: "Речной судак запечённый со стручковой фасолью в томатной пассате",
                short_description: "Постный рыбный ужин Партии №4: 41 г белка и минимум жиров.",
                primary_category_ru: "Рыба с овощами", meal_type: "Ужин", cuisine: "Домашняя",
                prep_time_min: 6, cook_time_min: 15, total_time_min: 21, cooking_temperature_c: 185, shelf_life_hours: 36,
                goal_tags_ru: ["Похудение", "Поддержание веса", "Сбалансированное питание"],
                dietary_tags_ru: ["Без сахара", "Без глютена", "Без лактозы", "Высокое содержание клетчатки"],
                allergens_ru: ["Рыба"],
                serving_recommendation: "Отлично подходит для разгрузочного вечера или фазы рекомпозиции.",
                nutrition: { raw_total_weight_g: 410, cooked_total_weight_g: 369, serving_weight_g: 369, serving_kcal: 278, serving_protein_g: 41.3, serving_fat_g: 4.5, serving_carbs_g: 18.0, serving_fiber_g: 7.1 },
                ingredients: [
                    { name: "Филе судака речного", amount_g: 165, state: "запечённый", dept: "Рыба и морепродукты", yieldFactor: 0.78, alt: "Филе минтая дальневосточного" },
                    { name: "Фасоль стручковая зелёная", amount_g: 140, state: "запечённый", dept: "Овощи, фрукты и зелень", yieldFactor: 0.85, alt: "Брокколи соцветия" },
                    { name: "Томатная пассата 100%", amount_g: 80, state: "сырой", dept: "Орехи, масла и соусы", yieldFactor: 1.0, alt: "Свежие томаты" }
                ],
                steps_structured: [
                    { step_number: 1, stage_name: "Запекание", duration_min: 15, temperature_c: 185, instruction: "Выложите судака и стручковую фасоль в форму, залейте томатной пассатой и запекайте 15 минут." }
                ]
            },
            {
                recipe_id: "RCP-00301", title_ru: "Спортивный коктейль с сывороточным протеином, голубикой и миндалём",
                short_description: "Быстрый жидкий перекус за 4 минуты (40 г белка) — идеален после зала или при низком аппетите.",
                primary_category_ru: "Протеиновые коктейли", meal_type: "Перекус", cuisine: "Спортивное питание",
                prep_time_min: 4, cook_time_min: 0, total_time_min: 4, cooking_temperature_c: 6, shelf_life_hours: 12,
                goal_tags_ru: ["Набор мышечной массы", "Спортивное питание", "Поддержание веса"],
                dietary_tags_ru: ["Без сахара", "Без глютена", "Вегетарианское"],
                allergens_ru: ["Лактоза", "Орехи"],
                serving_recommendation: "Максимально быстрое усвоение белка в жидкой форме без тяжести.",
                nutrition: { raw_total_weight_g: 345, cooked_total_weight_g: 342, serving_weight_g: 342, serving_kcal: 363, serving_protein_g: 40.3, serving_fat_g: 13.1, serving_carbs_g: 24.1, serving_fiber_g: 3.6 },
                ingredients: [
                    { name: "Изолят сывороточного протеина", amount_g: 32, state: "сырой", dept: "Растительные и спорт-продукты", yieldFactor: 1.0, alt: "Гороховый изолят" },
                    { name: "Молоко 1.5%", amount_g: 240, state: "сырой", dept: "Молочные продукты и яйца", yieldFactor: 1.0, alt: "Молоко безлактозное 1.5%" },
                    { name: "Голубика садовая свежая", amount_g: 55, state: "свежий", dept: "Овощи, фрукты и зелень", yieldFactor: 1.0, alt: "Банан, клубника" },
                    { name: "Миндаль цельный необжаренный", amount_g: 18, state: "свежий", dept: "Орехи, масла и соусы", yieldFactor: 1.0, alt: "Арахисовая паста" }
                ],
                steps_structured: [
                    { step_number: 1, stage_name: "Взбивание", duration_min: 4, temperature_c: 6, instruction: "Взбейте молоко, протеин, ягоды и миндаль в блендере 45 секунд." }
                ]
            },
            {
                recipe_id: "RCP-00318", title_ru: "Греческий йогурт с рикоттой, свежей клубникой, отрубями и кунжутом",
                short_description: "Лёгкий и вкусный перекус без готовки за 5 минут (подходит и без спорта).",
                primary_category_ru: "Йогурты", meal_type: "Перекус", cuisine: "Средиземноморская",
                prep_time_min: 5, cook_time_min: 0, total_time_min: 5, cooking_temperature_c: 6, shelf_life_hours: 24,
                goal_tags_ru: ["Похудение", "Поддержание веса", "Сбалансированное питание"],
                dietary_tags_ru: ["Без сахара", "Вегетарианское"],
                allergens_ru: ["Лактоза", "Кунжут"],
                serving_recommendation: "Удобный полдник или лёгкий утренний перекус с кальцием и пробиотиками.",
                nutrition: { raw_total_weight_g: 360, cooked_total_weight_g: 356, serving_weight_g: 356, serving_kcal: 347, serving_protein_g: 32.8, serving_fat_g: 14.9, serving_carbs_g: 27.6, serving_fiber_g: 4.7 },
                ingredients: [
                    { name: "Йогурт греческий натуральный 2%", amount_g: 225, state: "сырой", dept: "Молочные продукты и яйца", yieldFactor: 1.0, alt: "Скир исландский 0.5%" },
                    { name: "Сыр Рикотта Лайт 9%", amount_g: 50, state: "сырой", dept: "Молочные продукты и яйца", yieldFactor: 1.0, alt: "Творог мягкий 2%" },
                    { name: "Отруби овсяные пищевые", amount_g: 15, state: "сырой", dept: "Бакалея и крупы", yieldFactor: 1.0, alt: "Овсяные хлопья" },
                    { name: "Клубника садовая свежая", amount_g: 60, state: "свежий", dept: "Овощи, фрукты и зелень", yieldFactor: 1.0, alt: "Голубика, банан" },
                    { name: "Семена кунжута", amount_g: 10, state: "свежий", dept: "Орехи, масла и соусы", yieldFactor: 1.0, alt: "Семена чиа" }
                ],
                steps_structured: [
                    { step_number: 1, stage_name: "Сборка парфе", duration_min: 5, temperature_c: 6, instruction: "Смешайте греческий йогурт с рикоттой, добавьте нарезанную клубнику, отруби и кунжут." }
                ]
            }
        ];

export const SUBSTITUTIONS_V4 = [
            { match: /курин.*груд/i, target: "Филе грудки индейки", ratio: 1.0, dKcal: -7.9, dP: +1.4, dF: -1.4, dC: 0, eq: "1:1 Точная", note: "Выше белок, меньше жиров" },
            { match: /индейк/i, target: "Куриная грудка (филе)", ratio: 1.0, dKcal: +7.9, dP: -1.4, dF: +1.4, dC: 0, eq: "1:1 Точная", note: "Доступнее и дешевле" },
            { match: /говяд/i, target: "Телятина нежирная (филе)", ratio: 1.0, dKcal: -35.7, dP: -1.7, dF: -3.0, dC: 0, eq: "Близкая", note: "Мягче и быстрее готовится" },
            { match: /телят/i, target: "Говядина постная (вырезка)", ratio: 1.0, dKcal: +35.7, dP: +1.7, dF: +3.0, dC: 0, eq: "Близкая", note: "Больше гемового железа" },
            { match: /лосос|сёмг/i, target: "Филе радужной форели", ratio: 1.0, dKcal: -88.5, dP: -0.7, dF: -9.5, dC: 0, eq: "Легче", note: "Меньше калорий при сохранении Омега-3" },
            { match: /лосос|сёмг|форел/i, target: "Горбуша тихоокеанская (филе)", ratio: 1.0, dKcal: -83.2, dP: +0.1, dF: -8.7, dC: 0, eq: "Бюджетная", note: "Выгодная замена красной рыбы" },
            { match: /треск|судак/i, target: "Филе минтая дальневосточного", ratio: 1.0, dKcal: -13.2, dP: -2.4, dF: +0.3, dC: 0, eq: "Бюджетная", note: "Экономичная белая рыба" },
            { match: /кревет/i, target: "Филе командорского кальмара", ratio: 1.0, dKcal: +9.2, dP: -5.9, dF: +1.2, dC: +4.1, eq: "Бюджетная", note: "Доступный белковый морепродукт" },
            { match: /греч/i, target: "Киноа белая и трёхцветная", ratio: 1.0, dKcal: +10.0, dP: +0.3, dF: +1.1, dC: -2.9, eq: "1:1 Точная", note: "Полный аминокислотный профиль, без глютена" },
            { match: /булгур|перлов/i, target: "Гречневая крупа ядрица", ratio: 1.0, dKcal: -4.0, dP: +0.5, dF: +0.4, dC: -1.8, eq: "Без глютена", note: "Без глютена, всегда есть в магазине" },
            { match: /рис.*басмати|рис.*бурый/i, target: "Булгур из твёрдой пшеницы", ratio: 1.0, dKcal: -6.0, dP: +1.2, dF: -0.3, dC: -2.1, eq: "1:1 Точная", note: "Ниже гликемический индекс" },
            { match: /молоко.*1\.5|молоко коров/i, target: "Молоко безлактозное 1.5%", ratio: 1.0, dKcal: -1.0, dP: -0.1, dF: 0, dC: -0.1, eq: "Без лактозы", note: "Идентичное КБЖУ без лактозы" },
            { match: /творог/i, target: "Творог безлактозный 1.8%", ratio: 1.0, dKcal: -5.0, dP: +0.5, dF: -0.2, dC: -1.3, eq: "Без лактозы", note: "Комфортное пищеварение" },
            { match: /йогурт греч/i, target: "Скир исландский 0.5%", ratio: 1.0, dKcal: -11.0, dP: +1.1, dF: -1.4, dC: -0.5, eq: "Больше белка", note: "Выше белок, ниже жиры" },
            { match: /моцарелл/i, target: "Сыр Адыгейский мягкий", ratio: 1.0, dKcal: +8.0, dP: -1.0, dF: +1.2, dC: +0.4, eq: "1:1 Точная", note: "Легко найти в любом супермаркете" },
            { match: /броккол/i, target: "Цветная капуста соцветия", ratio: 1.0, dKcal: -5.0, dP: -0.6, dF: 0, dC: -0.5, eq: "1:1 Точная", note: "Равноценная клетчатка" }
        ];

export function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function byteLengthUtf8(str) {
    try {
        return new TextEncoder().encode(String(str)).length;
    } catch (e) {
        return unescape(encodeURIComponent(String(str))).length;
    }
}

export function formatDateYmd(dateObj) {
    return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")}`;
}

export function getTodayStr() {
    return formatDateYmd(new Date());
}

export function getTodayDayIndex() {
    const day = new Date().getDay();
    return day === 0 ? 6 : day - 1;
}

export function getWeekStartDateStr(refDate = new Date()) {
    const d = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
    const diffToMonday = d.getDay() === 0 ? -6 : 1 - d.getDay();
    d.setDate(d.getDate() + diffToMonday);
    return formatDateYmd(d);
}

export function getDateStrForWeekDay(dayIdx, weekStartStr = null) {
    const baseStr = weekStartStr || getWeekStartDateStr();
    const parts = baseStr.split("-").map(Number);
    const d = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
    d.setDate(d.getDate() + Number(dayIdx || 0));
    return formatDateYmd(d);
}

export function activityScoreToPal(score) {
    const s = Math.max(1, Math.min(10, Number(score) || 5));
    return Number((1.20 + ((s - 1) / 9) * 0.80).toFixed(2));
}

export function palToActivityScore(pal) {
    const p = Number(pal) || 1.50;
    return Math.max(1, Math.min(10, Number((1 + ((p - 1.20) / 0.80) * 9).toFixed(1))));
}

export function computePrecisionScore(u) {
    let s = 72;
    if (u?.sportType) s += 3;
    if (u?.preferencesText?.trim()) s += 3;
    if (u?.bodyFatPct) s += 9;
    if (u?.leanBodyMass) s += 8;
    if (u?.waistCm) s += 4;
    return Math.min(99, s);
}

export function calculateTargets(user) {
    const weight = Number(user.weight) || 70;
    const height = Number(user.height) || 180;
    const age = Number(user.age) || 20;
    const gender = user.gender || "male";
    const pal = Number(user.activityLevel) || activityScoreToPal(user.activityScore || 5);
    const goal = user.goal || "healthy";
    const sportKey = user.sportType || "none";
    const sp = SPORT_PROFILES[sportKey] || SPORT_PROFILES.none;

    let derivedLbm = user.leanBodyMass ? Number(user.leanBodyMass) : null;
    let derivedBf = user.bodyFatPct ? Number(user.bodyFatPct) : null;
    if (!derivedLbm && derivedBf) derivedLbm = Number((weight * (1 - derivedBf / 100)).toFixed(1));
    if (!derivedBf && derivedLbm && derivedLbm < weight) derivedBf = Number(((1 - derivedLbm / weight) * 100).toFixed(1));

    let bmr = 0;
    let formulaName = "Mifflin-St Jeor (1990)";
    if (derivedLbm && derivedLbm > 25) {
        if (pal >= 1.65 || sportKey === "strength" || sportKey === "combat") {
            bmr = Math.round(500 + 22 * derivedLbm);
            formulaName = "Cunningham (LBM Pro)";
        } else {
            bmr = Math.round(370 + 21.6 * derivedLbm);
            formulaName = "Katch-McArdle (LBM)";
        }
    } else {
        bmr = Math.round((10 * weight) + (6.25 * height) - (5 * age) + (gender === "male" ? 5 : -161));
    }

    const tdee = Math.round(bmr * pal);

    let goalFactor = 1.0;
    if (goal === "cut") {
        if (derivedBf && derivedBf <= (gender === "male" ? 13 : 20)) goalFactor = 0.85;
        else if (derivedBf && derivedBf >= (gender === "male" ? 25 : 33)) goalFactor = 0.78;
        else goalFactor = 0.80;
    } else if (goal === "bulk") {
        const highWaist = user.waistCm && (user.waistCm / height >= 0.52);
        goalFactor = (highWaist || (derivedBf && derivedBf >= (gender === "male" ? 20 : 28))) ? 1.08 : 1.13;
    }

    const rawDailyKcal = Math.round(tdee * goalFactor);

    let pKg = sp.pBase;
    if (goal === "healthy") pKg = sportKey === "none" ? 1.30 : sp.pBase;
    else if (goal === "cut") pKg = sp.pCut;
    else if (goal === "bulk") pKg = sp.pBulk;

    const protein = derivedLbm ? Math.round(derivedLbm * (pKg * 1.12)) : Math.round(weight * pKg);
    const minFatPct = goal === "healthy" ? 0.26 : sp.minFatPct;
    const fatKg = goal === "healthy" ? Math.max(sp.fatKg, 1.05) : (goal === "cut" ? sp.fatKg * 0.9 : sp.fatKg);
    const fat = Math.max(Math.round((rawDailyKcal * minFatPct) / 9), Math.round(weight * fatKg));

    const minCarbG = Math.round((derivedLbm || weight) * 2.0);
    const carbs = Math.max(minCarbG, Math.round((rawDailyKcal - protein * 4 - fat * 9) / 4));
    const exactKcal = (protein * 4) + (fat * 9) + (carbs * 4);

    return {
        bmr, tdee, dailyKcal: exactKcal, protein, fat, carbs,
        formulaName, precisionScore: computePrecisionScore(user),
        derivedLbm, derivedBf,
        goalFactorPct: Math.round((goalFactor - 1) * 100),
        proteinPerKg: (protein / weight).toFixed(1),
        fatPerKg: (fat / weight).toFixed(1),
        carbsPerKg: (carbs / weight).toFixed(1)
    };
}

export function reconcileMealMacros(targetKcal, rawP, rawF, rawC) {
    const baseAtwater = (4 * rawP) + (9 * rawF) + (4 * rawC);
    const scale = targetKcal / Math.max(1, baseAtwater);
    const p = Math.max(1, Math.round(rawP * scale));
    const f = Math.max(1, Math.round(rawF * scale));
    let c = Math.max(0, Math.round(rawC * scale));
    const cur = (4 * p) + (9 * f) + (4 * c);
    c = Math.max(0, c + Math.round((targetKcal - cur) / 4));
    return { kcal: (4 * p) + (9 * f) + (4 * c), protein: p, fat: f, carbs: c };
}

export function scaleTargetsToKcal(baseTargets, newKcal) {
    const ratio = newKcal / Math.max(1, baseTargets.dailyKcal);
    const p = Math.round(baseTargets.protein * Math.max(0.92, Math.min(1.08, ratio)));
    const f = Math.max(Math.round((newKcal * 0.20) / 9), Math.round(baseTargets.fat * ratio));
    const c = Math.max(45, Math.round((newKcal - p * 4 - f * 9) / 4));
    return Object.assign({}, baseTargets, {
        dailyKcal: (p * 4) + (f * 9) + (c * 4),
        protein: p, fat: f, carbs: c
    });
}

/*
 * КОНТРАКТ ХРАНЕНИЯ ВЕСА ИНГРЕДИЕНТОВ (ing.weight / amount_g):
 * - Если ing.state содержит "сыр" / "свеж" / "сух", ing.weight — это СЫРОЙ вес (как в магазине).
 * - Если ing.state — термически обработанное состояние ("варёный", "запечённый", "жареный"),
 *   ing.weight — это ГОТОВЫЙ вес на тарелке (соответствует kcal_per_100g в SQL-базе РФ).
 */
export function inferYieldFactor(ingName, state, explicitYield) {
    const y = Number(explicitYield);
    if (y > 0 && y !== 1.0) return y;
    const s = (state || "").toLowerCase();
    const n = (ingName || "").toLowerCase();
    if (/греч|рис|булгур|киноа|полб|перлов|ячнев|пшен|амарант|чечевиц|нут|горох|фасоль красн|макарон|паста|кускус|фунчоз/.test(n)) {
        return (s.includes("вар") || /отварн/.test(n)) ? 2.5 : 1.0;
    }
    if (/курин|индейк|говяд|телят|кролик|утк|печен|сердц|желуд|язык|фарш|форел|лосос|кижуч|нерк|сёмг|судак|тунец|треск|минтай|хек|камбал|сибас|дорад|палтус|муксун|кревет|кальмар|гребеш|осьминог/.test(n)) {
        if (s.includes("сыр") || s.includes("свеж")) return 1.0;
        return s.includes("запеч") ? 0.78 : 0.74;
    }
    if (/броккол|капуст|цукини|кабач|тыкв|батат|картофел|свёкл|шампиньон|вешенк|спарж|фасоль стручк|баклажан|шпинат/.test(n)) {
        if (s.includes("сыр") || s.includes("свеж")) return 1.0;
        return 0.85;
    }
    if (/яйц|белок/.test(n) && !s.includes("сыр")) return 0.92;
    return 1.0;
}

export function isIngredientRawState(ing) {
    const s = (ing?.state || "сырой").toLowerCase();
    return s.includes("сыр") || s.includes("свеж") || s.includes("сух");
}

export function toRawStoreGrams(ing) {
    const w = Number(ing?.weight ?? ing?.amount_g) || 0;
    if (w <= 0) return 0;
    if (isIngredientRawState(ing)) return Math.round(w);
    const yf = inferYieldFactor(ing.name, ing.state, ing.yieldFactor);
    return yf === 1.0 ? Math.round(w) : Math.max(5, Math.round(w / yf));
}

export function toCookedPlateGrams(ing) {
    const w = Number(ing?.weight ?? ing?.amount_g) || 0;
    if (w <= 0) return 0;
    if (!isIngredientRawState(ing)) return Math.round(w);
    const n = (ing.name || "").toLowerCase();
    if (/хлопь|овсян|сух|крупа/.test(n) && !/молоко|орех|семен|отруб|мука/.test(n)) {
        const yf = Number(ing.yieldFactor) > 1.0 ? Number(ing.yieldFactor) : 2.4;
        return Math.round(w * yf);
    }
    return Math.round(w);
}

export function computeMealWeightsFromIngredients(ingredients) {
    const list = Array.isArray(ingredients) ? ingredients : [];
    let rawSum = 0;
    let cookedSum = 0;
    list.forEach(ing => {
        rawSum += toRawStoreGrams(ing);
        cookedSum += toCookedPlateGrams(ing);
    });
    return {
        rawWeightG: Math.round(rawSum),
        cookedWeightG: Math.round(cookedSum)
    };
}

// Согласуем raw_total_weight_g и cooked_total_weight_g у встроенных рецептов EMBEDDED_MASTER_V4
EMBEDDED_MASTER_V4.forEach(r => {
    const w = computeMealWeightsFromIngredients(r.ingredients);
    if (r.nutrition) {
        r.nutrition.raw_total_weight_g = w.rawWeightG;
        r.nutrition.cooked_total_weight_g = w.cookedWeightG;
        r.nutrition.serving_weight_g = w.cookedWeightG;
    }
});

export function stemRussianWord(word) {
    const clean = (word || "").toLowerCase().replace(/[^а-яёa-z0-9-]/g, "");
    if (clean.length <= 4) return clean;
    const stripped = clean.replace(/(ами|ями|ого|его|ому|ему|ими|ыми|ою|ею|ов|ев|ей|ам|ям|ах|ях|ую|юю|ия|ие|ий|ый|ой|ая|яя|ое|ее|ом|ем|а|я|у|ю|ы|и|е|о|ь)$/, "");
    return stripped.length >= 4 ? stripped : clean.slice(0, Math.max(4, clean.length - 1));
}

export function parseUserExclusions(preferencesText) {
    const raw = (preferencesText || "").toLowerCase().trim();
    if (!raw) return { ruleKeys: [], customStems: [] };

    const chunks = raw.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
    const ruleKeys = new Set();
    const customStems = new Set();

    chunks.forEach(chunk => {
        const cleaned = chunk
            .replace(/^(аллергия\s+на|непереносимость|не\s+люблю|не\s+ем|исключить|исключи|убрать|убери|без|нет)\s+/gi, "")
            .trim();
        if (!cleaned) return;

        let matchedKnown = false;
        Object.entries(EXCLUSION_SYNONYMS).forEach(([key, cfg]) => {
            if (cfg.triggers.some(tr => chunk.includes(tr) || cleaned.includes(tr))) {
                ruleKeys.add(key);
                matchedKnown = true;
            }
        });

        if (!matchedKnown) {
            cleaned.split(/\s+/).forEach(tok => {
                if (tok.length >= 3 && !["или", "для", "при", "под", "над", "все", "всё"].includes(tok)) {
                    customStems.add(stemRussianWord(tok));
                }
            });
        }
    });

    return { ruleKeys: Array.from(ruleKeys), customStems: Array.from(customStems) };
}

export function recipeMatchesUserConstraints(recipe, user) {
    const sp = SPORT_PROFILES[user?.sportType || "none"] || SPORT_PROFILES.none;
    const ingNames = (recipe.ingredients || []).map(i => i.name).join(" ");
    const blob = `${recipe.title_ru || ""} ${(recipe.allergens_ru || []).join(" ")} ${ingNames}`.toLowerCase();
    const dietBlob = (recipe.dietary_tags_ru || []).join(" ").toLowerCase();

    if (sp.avoidSupps && /изолят|протеин|казеин/i.test(blob)) return false;

    const { ruleKeys, customStems } = parseUserExclusions(user?.preferencesText || "");

    for (const key of ruleKeys) {
        const cfg = EXCLUSION_SYNONYMS[key];
        if (!cfg) continue;
        const explicitlySafe = (cfg.allowIfContains || []).some(re => re.test(blob) || re.test(dietBlob));
        if (explicitlySafe) continue;
        if (cfg.blockPatterns.some(re => re.test(blob))) return false;
    }

    for (const stem of customStems) {
        if (stem && blob.includes(stem)) return false;
    }

    return true;
}

export function computeSmoothedWeightTrend(checkIns, todayStr, lastAdjustDate) {
    const byDate = {};
    (checkIns || []).forEach(ci => {
        if (ci?.date && Number(ci.weight) > 0) {
            byDate[ci.date] = Number(ci.weight);
        }
    });
    const series = Object.keys(byDate).sort().map(date => ({ date, weight: byDate[date] }));
    if (series.length < 2) {
        return { ready: false, reason: "need_more_points", spanDays: 0, points: series.length };
    }

    const alpha = 0.35;
    let ema = series[0].weight;
    const emaSeries = series.map((pt, idx) => {
        ema = idx === 0 ? pt.weight : (alpha * pt.weight + (1 - alpha) * ema);
        return { date: pt.date, weight: pt.weight, ema: Number(ema.toFixed(3)) };
    });

    const latest = emaSeries[emaSeries.length - 1];
    const minAnchorDate = lastAdjustDate || series[0].date;
    const daysBetween = (d1, d2) => Math.round((new Date(d2) - new Date(d1)) / 86400000);
    const totalSinceAnchor = daysBetween(minAnchorDate, latest.date);
    if (totalSinceAnchor < 7) {
        return { ready: false, reason: "span_too_short", spanDays: totalSinceAnchor, points: series.length };
    }

    const pointsInWindow = emaSeries.filter(p => p.date >= minAnchorDate);
    if (pointsInWindow.length < 3 && totalSinceAnchor < 14) {
        return { ready: false, reason: "need_3_points_or_14d", spanDays: totalSinceAnchor, points: pointsInWindow.length };
    }

    const eligibleRefs = pointsInWindow.filter(p => daysBetween(p.date, latest.date) >= 7);
    if (!eligibleRefs.length) {
        return { ready: false, reason: "span_too_short", spanDays: totalSinceAnchor, points: pointsInWindow.length };
    }

    const refPoint = eligibleRefs.reduce((best, cur) => {
        const dBest = Math.abs(daysBetween(best.date, latest.date) - 14);
        const dCur = Math.abs(daysBetween(cur.date, latest.date) - 14);
        return dCur < dBest ? cur : best;
    }, eligibleRefs[0]);

    const spanDays = Math.max(7, daysBetween(refPoint.date, latest.date));
    const weeklyRatePct = ((latest.ema - refPoint.ema) / Math.max(1, refPoint.ema)) * (7 / spanDays) * 100;

    return {
        ready: true,
        spanDays,
        refDate: refPoint.date,
        latestDate: latest.date,
        emaStart: refPoint.ema,
        emaNow: latest.ema,
        weeklyRatePct: Number(weeklyRatePct.toFixed(2))
    };
}

export function evaluatePlanAdherence(dailyHistory, startDateStr, endDateStr, fallbackGoalKcal = 2000) {
    const hist = dailyHistory || {};
    const startDt = new Date(startDateStr);
    const endDt = new Date(endDateStr);
    const totalDays = Math.max(7, Math.min(14, Math.round((endDt - startDt) / 86400000)));

    let loggedDays = 0;
    let sumEaten = 0;
    let sumGoal = 0;

    for (let i = 0; i < totalDays; i++) {
        const d = new Date(endDt.getFullYear(), endDt.getMonth(), endDt.getDate() - i);
        const key = formatDateYmd(d);
        const rec = hist[key];
        if (rec && ((Number(rec.eatenCount) || 0) >= 1 || (Number(rec.eatenKcal) || 0) > 0)) {
            loggedDays++;
            sumEaten += Number(rec.eatenKcal) || 0;
            sumGoal += Number(rec.goalKcal) || Number(fallbackGoalKcal) || 2000;
        }
    }

    const coverageRatio = loggedDays / totalDays;
    const avgEaten = loggedDays > 0 ? sumEaten / loggedDays : 0;
    const avgGoal = loggedDays > 0 ? sumGoal / loggedDays : 0;
    const deviationRatio = avgGoal > 0 ? Math.abs(avgEaten - avgGoal) / avgGoal : 1;

    return {
        totalDays,
        loggedDays,
        coverageRatio,
        deviationRatio,
        isReliable: coverageRatio >= 0.70 && deviationRatio <= 0.15
    };
}
