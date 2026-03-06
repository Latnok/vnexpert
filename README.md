# vnexpert

Telegram bot на Node.js + TypeScript для:
- поиска по MongoDB (`messages`) по ключевым словам и фильтрам;
- fallback в OpenAI Responses API, если запрос неразобран или данных мало;
- ежедневного персонального дайджеста по категориям в таймзоне пользователя.

Окна поиска:
- обычные объявления: последние 7 дней;
- `currency_exchange`: последние 24 часа.

## Требования
- Node.js `v20.11+`
- MongoDB (локально запущена)

## Установка
```powershell
npm install
Copy-Item .env.example .env
```

Ключевые env-переменные fallback:
- `LLM_FALLBACK_ENABLED`
- `LLM_FALLBACK_ON_PARSE_FAIL`
- `LLM_FALLBACK_ON_LOW_RESULTS`
- `LLM_FALLBACK_MIN_RELEVANT_RESULTS`

## Запуск
```powershell
npm run dev
```

## Интеграционные тесты
```powershell
# по умолчанию: mongodb://localhost:27017/vnexpert_integration
npm run test:integration
```

Опционально можно задать отдельный URI:
```powershell
$env:MONGODB_URI_TEST="mongodb://localhost:27017/vnexpert_integration"
npm run test:integration
```

## Команды бота
- `/ask <запрос>`
- `/digest`
- `/categories`
- `/time`
- `/off`
