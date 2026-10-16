# Бесплатная публикация BALI MENU для тестирования регистрации

Веб-приложение уже использует публичную конфигурацию Firebase `bali-menu-5a48b`. Google Authentication включён пользователем, а правила Firestore подготовлены и загружены в Firebase.

Для **бесплатного тестирования регистрации** можно использовать GitHub Pages в публичном репозитории GitHub Free. Этот способ не требует Firebase Functions, платных ключей или регистрации Apple Developer.

## 1. Включение GitHub Pages (делает владелец репозитория)

1. Откройте **https://github.com/Nik13599/BALI-MENU/settings/pages**.
2. В **Build and deployment → Source** выберите **Deploy from a branch**.
3. В **Branch** выберите **main**, каталог **/(root)**.
4. Нажмите **Save**, подождите завершения автоматической публикации.
5. Когда GitHub подтвердит размещение, появится ссылка, ожидаемо **https://nik13599.github.io/BALI-MENU/**. Не считайте её работающей, пока GitHub Pages явно не подтвердил публикацию.

GitHub Pages публикует только статические HTML/CSS/JS-файлы. Он не является заменой защищённого серверного API для предзаказов.

## 2. Разрешённый домен Firebase Authentication

Откройте **https://console.firebase.google.com/project/bali-menu-5a48b/authentication/settings** → **Authorized domains** (раздел Settings в Authentication).

Добавьте **`nik13599.github.io`** — **без https:// и без /BALI-MENU/**. 
Google (Sign-in method) должен быть **Enabled**.

## 3. Проверка

1. Откройте опубликованную страницу с HTTPS.
2. Нажмите «Войти / Регистрация» → «Войти через Google».
3. Выберите свой Google-аккаунт. Email подтянется автоматически.
4. Введите имя и телефон, например `+375291234567`, нажмите «Сохранить профиль».
5. В Firestore → Data должна появиться коллекция `users`, документ с UID учётной записи.
6. Перезагрузите страницу — сохранённый профиль должен подгрузиться автоматически.
7. Проверьте, что другой Google-аккаунт не может читать/редактировать чужой профиль.

Если `auth/unauthorized-domain`, повторно проверьте шаг 2. Если появляется `permission-denied`, проверьте, опубликованы ли правила из `firestore.rules`.

## Публичный тест — ограничения

- Сайт общедоступен после включения GitHub Pages. Используйте тестовый аккаунт, не приглашайте гостей до готовности правовой информации о обработке персональных данных.
- Приём настоящих предзаказов, админ-доступ и синхронизация заказов с Google Таблицами пока **отключены**.
- Данные имён, телефонов, email сохраняются в Firestore только после входа и заполнения профиля.
- Никаких платных служб не включайте. Firestore и GitHub Pages используются в пределах бесплатных лимитов.

## Источники

- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- Firebase authorized domains: https://support.google.com/firebase/answer/6400741
- Firebase Google sign-in: https://firebase.google.com/docs/auth/web/google-signin
