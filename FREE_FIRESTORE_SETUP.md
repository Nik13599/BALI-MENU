# BALI MENU — настройка бесплатного Firestore (Spark)

Проект Firebase: **`bali-menu-5a48b`**. Это руководство не требует перехода на Blaze.

## 1. Создайте базу

Откройте https://console.firebase.google.com/project/bali-menu-5a48b/firestore

- Databases & Storage → Firestore → Create database.
- Если предложат тип: **Standard edition**.
- Database ID: **`(default)`**.
- Регион: **`europe-west3` (Frankfurt)**, если этот вариант предлагается и расположение ещё не выбрано.
- Rules starting mode: **Production mode**; **Test mode не подходит** для личных данных.
- Create.

Регион для созданной базы обычно нельзя просто изменить. Важно не создавать дополнительных баз: бесплатный лимит Firestore применяется только к одной базе на Firebase-проект.

## 2. Примените правила

После создания перейдите в Firestore → **Rules**.

1. Откройте [firestore.rules](https://github.com/Nik13599/BALI-MENU/blob/main/firestore.rules).
2. Скопируйте всё содержимое файла и **полностью замените** текущий текст во вкладке Rules.
3. Нажмите **Publish**. Если Firebase выдаст ошибку компиляции — не ослабляйте правила; пришлите текст ошибки.

Эти правила:
- разрешают читать только `users/{свой Firebase UID}`;
- требуют подтверждённую почту и корректный номер телефона;
- запрещают менять email и UID через форму;
- **закрывают доступ к коллекциям заказов и администраторов** до готовности защищённого backend.

## 3. Проверьте Google Authentication

https://console.firebase.google.com/project/bali-menu-5a48b/authentication/providers

- Google: **Enabled**.
- Email/Password, Apple и Phone: **не требуются**.
- В Authentication → Settings → Authorized domains должен присутствовать **тот домен, где реально будет размещён сайт**, например домен Firebase Hosting.

## 4. Что станет доступно после публикации сайта

- Гость нажимает «Войти через Google».
- Указывает **имя** и контактный **номер телефона**, email приходит от Google автоматически.
- Данные сохраняются в Firestore `users/{uid}`.
- При повторном входе профиль загрузится автоматически.
- Гость сможет менять имя и телефон, но не свой email в форме.

**Пока сайт не опубликован, правила не применены, защищённый сервер заказов не готов — реальные предзаказы не принимать.**

## Лимиты бесплатного плана

На момент подготовки документа Firestore имеет бесплатные лимиты в том числе: 1 GiB хранения, 50 000 чтений в сутки, 20 000 записей в сутки. На бесплатном Spark не используйте Cloud Functions (для их развёртывания обычно нужен Blaze), платную SMS-авторизацию и функции резервного копирования, которым требуется биллинг.

Официальные источники:
- https://firebase.google.com/docs/firestore/quickstart
- https://firebase.google.com/docs/firestore/pricing
- https://firebase.google.com/docs/firestore/security/get-started
- https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
