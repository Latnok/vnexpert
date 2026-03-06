# DB fields for Search Service

Актуальное описание полей MongoDB, по которым внешний сервис строит поиск.

## 1) Коллекция `messages`

### 1.1 Базовые поля

| Поле | Тип | Назначение |
|---|---|---|
| `_id` | ObjectId | id документа |
| `source` | string | источник (`telegram`) |
| `chat_id` | number | id чата |
| `chat_title` | string | название чата |
| `message_id` | number | id сообщения в чате |
| `sender_id` | number\|null | id автора |
| `date` | Date | время публикации в Telegram |
| `created_at` | Date | время вставки в БД |
| `updated_at` | Date | время последнего обновления |

### 1.2 Текст и медиа

| Поле | Тип | Назначение |
|---|---|---|
| `text` | string | нормализованный текст/подпись |
| `grouped_id` | string\|null | id медиа-альбома |
| `text_from_grouped_caption` | boolean | текст взят из подписи альбома |
| `has_media` | boolean | есть ли медиа |
| `media_links` | string[] | ссылки (включая permalink `t.me/...`) |
| `media_refs` | object[] | media refs Telegram |
| `raw` | object | минимальный raw payload |

### 1.3 Q/A поля

| Поле | Тип | Назначение |
|---|---|---|
| `reply_to_message_id` | number\|null | id сообщения, на которое ответили |
| `is_question_like` | boolean | есть признаки вопроса |
| `is_qa` | boolean | reply + question-like |
| `qa_role` | string\|null | `question` / `answer` |
| `qa_question_message_id` | number\|null | для ответа ссылка на вопрос |
| `has_answers` | boolean | у вопроса есть ответы |
| `qa_last_answer_at` | Date\|null | когда пришёл последний ответ |
| `qa_responders` | number[] | список ответивших |
| `qa_answers` | object[] | последние ответы (до 50) |

`qa_answers[]`:
- `answer_message_id: number`
- `responder_id: number|null`
- `text: string`
- `answered_at: Date`

### 1.4 Классификация

| Поле | Тип | Назначение |
|---|---|---|
| `ad_category` | string | категория |
| `ignored_subtype` | string\|null | подтип для `ignored` |
| `classification_source` | string | `rules` / `llm` / `rules+llm` |
| `classification_confidence` | number | confidence 0..1 |
| `classification_reason` | string | причина решения |

Бизнес-правила:
- Если `has_media=false`, сообщение считается не-рекламным и уходит в `ad_category="ignored"` с `ignored_subtype="text_no_media"`.
- Для `bike_rent` есть дополнительная валидация объявления: обязательно `has_media=true`, есть цена, и есть bike-сигнал. Иначе -> `ad_category="other"`, `classification_reason="bike_validation_failed"`.

Текущие категории:
- `real_estate_rent`
- `bike_rent`
- `food_place`
- `job_vacancy`
- `city_event`
- `currency_exchange`
- `casino_poker`
- `visaran`
- `excursions`
- `other_services`
- `ignored`
- `other`

### 1.5 Жизненный цикл сообщения

| Поле | Тип | Назначение |
|---|---|---|
| `status` | string | `active` / `edited` / `deleted` |
| `edited_at` | Date\|null | когда редактировано |
| `deleted_at` | Date\|null | когда удалено |

### 1.6 Извлечённые структуры

| Поле | Тип | Назначение |
|---|---|---|
| `extracted_real_estate` | object\|null | извлечение по недвижимости |
| `extracted_bike` | object\|null | извлечение по байкам |
| `extracted_currency` | object\|null | извлечение курсов валют |

`extracted_real_estate` (`parser_version: re_v3`):
- `price_detected`
- `price_candidates[]`
- `price_primary`
- `contract_term`
- `deposit_term`
- `location`
- `other_expenses` (в т.ч. `state_tariff`)

`extracted_bike` (`parser_version: bike_v1`):
- `is_bike_ad`
- `validation: { has_media, has_price, has_bike_signal }`
- `deal_type: rent | sale | mixed | unknown`
- `bike_brand`
- `bike_model`
- `engine_cc`
- `location`
- `price_primary` (для rent может быть `period: day|week|month`, для sale `period=null`)
- `condition`
- `year`
- `mileage_km`
- `deposit`
- `delivery`
- `documents`

`extracted_currency` (`parser_version: fx_v4`):
- `vnd_rub`
- `vnd_usd`
- `vnd_usdt`
- `candidates`

## 2) Коллекция `chat_catalog`

| Поле | Тип | Назначение |
|---|---|---|
| `chat_id` | number | id чата |
| `title` | string | название |
| `username` | string\|null | username |
| `type` | string | тип диалога |
| `selected_by_filter` | boolean | попадает в include/exclude фильтр |
| `include_keywords_snapshot` | string[] | снимок include |
| `exclude_keywords_snapshot` | string[] | снимок exclude |
| `updated_at` | Date | время обновления |

## 3) Коллекция `settings`

- `key: "chat_name_filter"`:
  - `include_keywords: string[]`
  - `exclude_keywords: string[]`
  - `updated_at: Date`
- `key: "classification_rules"`:
  - `rules: { category, keywords, regexes }[]`
  - `updated_at: Date`

## 4) Служебные коллекции

`state`:
- `collector_checkpoint` (`last_run_at`, `per_chat_last_message_id`)
- `collector_heartbeat` (`service`, `updated_at`)

`analytics_daily`:
- `key`, `start_at`, `end_at`, `generated_at`
- `totals.messages`
- `by_category[]`
- `ignored_subtypes[]`
- `top_chats[]`

`health_events`:
- `kind`, `created_at`, payload
- TTL: 60 дней

## 5) Индексы

`messages`:
- unique `{ chat_id: 1, message_id: 1 }`
- `{ ad_category: 1, date: -1 }`
- `{ chat_id: 1, date: -1 }`

`chat_catalog`:
- unique `{ chat_id: 1 }`
- `{ selected_by_filter: 1, title: 1 }`

`settings`:
- unique `{ key: 1 }`

`state`:
- unique `{ key: 1 }`

`analytics_daily`:
- unique `{ key: 1 }`

`health_events`:
- `{ kind: 1, created_at: -1 }`
- TTL `{ created_at: 1 }` `expireAfterSeconds=5184000`

## 6) Минимальный контракт для Search API

Обязательные фильтры:
- `status in [active, edited]`
- `selected_by_filter=true` (через `chat_catalog`)
- период (`date_from`, `date_to`)

Основные фильтры:
- `ad_category[]`
- `chat_id[]`
- `q` по `text`
- `has_media`
- `is_question_like` / `is_qa`
- для `real_estate_rent`: `extracted_real_estate.price_primary.amount`, `contract_term`, `location`, `other_expenses`
- для `bike_rent`: `extracted_bike.is_bike_ad`, `deal_type`, `bike_brand`, `bike_model`, `engine_cc`, `location`, `price_primary.amount/period`
- для `currency_exchange`: `extracted_currency.vnd_rub|vnd_usd|vnd_usdt`

Сортировки:
- `date desc` (default)
- `classification_confidence desc`
- `qa_last_answer_at desc`
