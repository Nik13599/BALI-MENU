# Подключение входа через Apple для BALI MENU

**Статус:** клиентская кнопка и Firebase OAuthProvider(`apple.com`) реализованы в `index.html` и `auth.js`. Это **не означает**, что вход через Apple уже включён: необходимо завершить Apple Developer и Firebase Console.

## Требования Apple

- Для настройки Sign in with Apple требуется участие в **Apple Developer Program**.
- Для авторизации на веб-сайте нужен основной **App ID**, для которого включён Sign in with Apple, а также связанный с ним **Services ID**.
- Создайте **Sign in with Apple private key**. Ключ `.p8` нельзя хранить в GitHub и нельзя отправлять в чат.

Официальные шаги Apple: https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web

## 1. Apple Developer

1. Перейдите на https://developer.apple.com/account/resources/identifiers/list.
2. В **Identifiers → App IDs** настройте основной App ID с возможностью **Sign in with Apple** (если ещё не создан).
3. Добавьте **Services ID** (например, `com.bali.menu.web`, если уникален), включите **Sign in with Apple**, выберите основной App ID.
4. Настройте веб-домен и callback:

   - **Domains and Subdomains:** `bali-menu-5a48b.firebaseapp.com`
   - **Return URLs:** `https://bali-menu-5a48b.firebaseapp.com/__/auth/handler`

5. Зарегистрируйте Services ID и сохраните его идентификатор.
6. Создайте **Key** с Sign in with Apple, запишите **Key ID**; в аккаунте Apple Developer найдите **Team ID**. Скачайте приватный ключ `.p8`. Храните его только в защищённом хранилище или вводите непосредственно в Firebase.

## 2. Firebase Console

1. Откройте https://console.firebase.google.com/project/bali-menu-5a48b/authentication/providers.
2. Выберите **Apple** и включите **Enable**.
3. Для входа на сайте **укажите Services ID**, созданный в Apple Developer (даже если интерфейс Firebase показывает его как необязательный: это может относиться к нативным Apple-платформам).
4. Раскройте **OAuth code flow configuration** и укажите **Apple Team ID**, **Key ID** и содержимое Apple private key **только в Firebase Console**.
5. Нажмите **Save**.
6. Если Firebase будет отправлять письма на скрытые Apple-адреса (`@privaterelay.appleid.com`), настройте Apple Private Email Relay согласно документации и зарегистрируйте подходящий адрес отправителя.

## 3. Проверка

- Проверяйте на HTTPS-сайте после безопасной публикации Firebase Hosting.
- При первом входе через Apple гость может выбрать **Hide My Email**. В этом случае электронный адрес в профиле — адрес Apple Private Relay, а не настоящий email гостя. Это штатный вариант электронной почты для входа.
- Имя и телефон всегда обязательны; имя, которое Apple может отдать только при первом входе, не должно считаться заменой явного заполнения профиля.
- На этапе реальных заказов проверка профиля и идентификатора пользователя должна выполняться и сервером.
- Один человек, вошедший через Google и Apple с разными email, может получить **разные** Firebase-профили. Объединение аккаунтов потребует отдельного решения.
- Пока Firebase и защищённый сервер заказов не развернуты, **не используйте регистрацию для реальных гостей**.

Официальная инструкция Firebase:
https://firebase.google.com/docs/auth/web/apple
