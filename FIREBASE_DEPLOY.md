# Подключение Firebase к BALI MENU

## Текущий статус (17 октября 2026)

В ChatGPT подтверждено, что интеграция Firebase установлена, но её операции управления проектами пока не появились среди доступных действий этой сессии. Пользователь зарегистрировал Firebase Web App для `bali-menu-5a48b`; публичная веб-конфигурация добавлена в `firebase-config.js`. Однако Authentication (Google), Firestore, правила доступа и Hosting ещё НЕ настроены и не развёрнуты. Подтверждённого адреса сайта и работающего приёма заказов пока нет.

Репозиторий: https://github.com/Nik13599/BALI-MENU
Таблица: https://docs.google.com/spreadsheets/d/1g29MM-3RO2gg8ihwFWrHjf24XqZO3N1B1BdUVT2rbkw/edit

## Подключение существующего или нового Firebase-проекта

1. В https://console.firebase.google.com/ создайте **отдельный** проект для BALI MENU или выберите подходящий пустой проект. Не подключайте систему к Firebase-проекту другого действующего приложения BALI без анализа его правил и функций.
2. Добавьте Web App через Project settings → Your apps. Из конфигурации возьмите Firebase API key, auth domain, project ID и app ID. Эти четыре значения относятся к публичной конфигурации JavaScript SDK, а не к серверным секретным ключам.
3. Откройте Authentication → Sign-in method и **включите Google**. Добавьте разрешённый домен сайта. Если используется Firebase Hosting, обычно это домен проекта `<project-id>.web.app` / `<project-id>.firebaseapp.com`; для предпросмотра может потребоваться отдельно разрешить его фактический домен.
4. Создайте Cloud Firestore в подходящем регионе. Ознакомьтесь с `firestore.rules`, затем примените правила к **новому отдельному проекту**. Не перезаписывайте правила общей базы, от которой зависят другие приложения.
5. Протестируйте вход Google: без имени, телефона и подтверждённого email оформление заказа блокируется. Форма профиля хранит имя, телефон, email, UID в документе `users/{uid}`.
6. Для реальных заказов потребуется отдельный безопасный серверный API с проверкой Firebase ID Token, статуса, товаров, итоговой цены и принадлежности заказа пользователю, а также синхронизация с Google Таблицей. Старый Apps Script-проект по-прежнему отключён.

## Автоматические проверки кода

При каждом push в ветку `main` GitHub Actions запускает
`.github/workflows/ci.yml`: проверку JavaScript и статические проверки полей авторизации.

## Ручной деплой тестового Hosting-превью

Workflow: `.github/workflows/firebase-preview.yml`.

Он **не запускается автоматически** и **не затрагивает Firestore Rules**. Для него сначала настраивается GitHub → Settings → Secrets and variables → Actions → Variables:

| Переменная | Значение |
|---|---|
| `FIREBASE_PROJECT_ID` | ID выделенного Firebase-проекта |
| `FIREBASE_API_KEY` | Web API key из Firebase web app |
| `FIREBASE_AUTH_DOMAIN` | Web authDomain из конфигурации |
| `FIREBASE_APP_ID` | Web appId |
| `FIREBASE_WIF_PROVIDER` | Путь Google Workload Identity Provider |
| `FIREBASE_DEPLOY_SERVICE_ACCOUNT` | Адрес отдельной служебной учётной записи Google Cloud |

Для Google Cloud Workload Identity Federation создайте provider, который доверяет **только** GitHub-репозиторию `Nik13599/BALI-MENU`, и дайте отдельному service account минимальные права, необходимые для Hosting preview. Убедитесь, что у service account нет избыточных ролей администратора всего проекта. При использовании GitHub Environment `firebase-preview` можно включить требование ручного одобрения деплоя.

После этого GitHub → Actions → «Firebase Hosting — ручная проверочная публикация» → Run workflow.

Workflow использует [google-github-actions/auth](https://github.com/google-github-actions/auth) с OIDC, то есть не требует загрузки JSON-ключа в репозиторий. Он генерирует `firebase-config.js` из GitHub Variables только в runner, а затем публикует **preview** на 7 дней.

**Ни этот workflow, ни подключение Google Drive не активируют реальный приём заказов.** Для этого нужен backend и тестирование.

## Безопасность

- Никогда не вставляйте `serviceAccountKey.json`, приватные OAuth client secrets, токены и пароли в файлы публичного GitHub-репозитория.
- Электронная почта через Google подтверждается аккаунтом. **Телефон пока не верифицируется через SMS.**
- У Firestore по умолчанию закрыты все коллекции, кроме профиля собственного пользователя. Это намеренно: нельзя отдавать клиентам прямую запись в заказы или роль администратора.
- Настоящее меню, цены и мероприятия ещё не загружены; не вводите реальных покупателей до запуска защищённого backend.

## Документация Firebase

- https://firebase.google.com/docs/auth/web/google-signin
- https://firebase.google.com/docs/firestore/security/get-started
- https://firebase.google.com/docs/hosting/github-integration
- https://firebase.google.com/docs/cli
