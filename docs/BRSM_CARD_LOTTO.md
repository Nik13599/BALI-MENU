> **Архивное описание ранней концепции.** База BALI COIN теперь переносится
> на Firebase/Firestore. Упоминания Google Sheets, Cloudflare и необходимости
> синхронизировать два независимых номера BALI ID ниже относятся к старой
> концепции, **не к текущей реализации**. Актуальная схема, порядок миграции и
> ограничения публикации: [FIREBASE_MIGRATION_STATUS.md](./FIREBASE_MIGRATION_STATUS.md).
>
# BALI CARD BRSM | KONTAKT LOTTO

Implementation branch: **not publicly deployed**. The interactive card uses existing BALI SVG white-filtered and new BRSM CSS. The provided reference mockup is not yet transferred as an exact raster asset.

## Behavior
- Existing Google Authentication and six-digit BALI ID reused, no extra account.
- BRSM card assigned by a privileged director/admin or a limited one-time/multi-use BRSM promo.
- User's BALI ID screen switches between existing card and BRSM.
- Three QR check-ins must belong to different actual KONTAKT events in the normal BALI calendar.
- Each QR contains a cryptographically random bearer token. Database stores its SHA-256 digest. The server transaction marks it used exactly once.
- Redeeming QR allowed only in the calendar event's local-time window (90 minutes before until 2 hours after).
- 3 valid visits open 10 unique secure random numbers (1..90), and lock the ticket.
- Starting a draw snapshots eligible cards; cards and visits cannot change after that.
- On-stage host manually enters drawn balls. Matches are visible, the 5-match leading cohort is frozen, and if tied, competition continues through 6,7,... until one winner.
- True unbreakable ties after 90 drawn numbers require a separately confirmed random tiebreak among the last tied users.
- QR, promo codes and BRSM events can be disabled by staff; manually granted visits retain employee attribution.
- Erroneous visits can be reversed with a required reason and immutable `brsmAudit` entry before the draw begins; if a completed card loses its third visit, its ticket is invalidated.

## Security
- Firebase Functions enforce staffRoles/director or admins/active on every management call.
- Firestore client reads only own BRSM card and public draw; all new collections are server-write-only.
- Only real approved KONTAKT events can be added in BRSM, and a QR is tied to that canonical event ID.
- Staff must verify membership and 18+ eligibility outside this feature. Promo possession alone does not establish legal eligibility.

## Release checklist
1. Execute npm ci, npm test, npm run test:browser, npm run test:firebase in staging. Check CI results in pull request.
2. Approve applicable Belarus advertising-game/lottery and data protection rules with counsel before promotional release.
3. Deploy Firestore rules and Cloud Functions through existing MANUAL Firebase GitHub workflow after staging verification. GitHub commits alone do not deploy the backend.
4. Publish static web files to baliminsk.by only after backend is deployed.
5. Create real KONTAKT events in the normal calendar (IDs normally YYYY-MM-DD or YYYY-MM-DD__2).
6. Generate QR tokens within the event's expiry window, print, and rehearse expired/reused/token-theft protection.
7. Rehearse two cards tied at five matches and draw cancellation/undo on a staging project.

## Known limits
- One draw campaign at brsmDraws/current. Next campaigns require controlled archive and reset: NEVER delete live records as a quick workaround.
- At most 1500 eligible participants in one snapshot; larger events require server-side sharding.
- Admin tables display recent 80 cards; drawing covers all eligible cards up to the cap.
- Not guaranteed free: Cloud Functions/Firestore consume quota and may require billing.
- This is a new implementation based on the ideas of GitHub MIT projects, not a drop-in copy of those projects.

- Operator search: the last 80 cards stay in the lightweight list, and any issued card is retrievable by six-digit BALI ID using the protected getBrsmCardAdmin callable (no bulk download of all 800 guests).

## Finished-draw export
Director/administrator can export CSV and JSON after winner is final. Includes all snapshotted ticket numbers, matches, winner, called balls and the audit trail, plus a SHA-256 digest of the canonical report data. The report is deliberately restricted to authenticated staff. CSV fields are escaped for spreadsheet import.

## Winner confirmation
After the first unique five-or-more-number winner, the draw moves to `provisional`. The director must confirm the result in BRSM admin before the draw becomes `finished`. Confirmed results are immutable, including undo. The staff-only final CSV/JSON protocol is unlocked only after confirmation. Evaluating up to 1,500 cards uses an indexed incremental draw computation; no websocket server is needed.


## Настраиваемые повторяемые кампании BRSM (версия 2)

Директор создаёт черновик кампании и устанавливает собственные правила. Существующие Google-аккаунты гостей и постоянная карта BRSM сохраняются.

- Название кампании.
- Необходимые разные посещения КОНТАКТ: от 1 до 12.
- Количество пронумерованных бочонков: от 10 до 120.
- Количество уникальных чисел в билете каждого раунда: от 1 до 30 и не больше числа бочонков.
- Совпадений для победы: от 1 до числа в билете.
- Призы и число раундов: по одному призу на строку; от 1 до 12 раундов. Каждый раунд проводит новый тираж бочонков.

Правила редактируются только в состоянии draft (черновик). Активация переводит кампанию в open (регистрация), фиксирует правила. После старта первого раунда входы больше не засчитываются. Следующий раунд начинается только после подтверждения победителя предыдущего. После финального раунда статус finished, после архивирования archived. Новая кампания может активироваться только после завершения прошлой, и старые билеты/посещения в новую не переносятся.

Распределение данных Firestore:
- brsmCampaignState/active: указатель на активную кампанию;
- brsmCampaigns/{id}: конфигурация и статус;
- brsmCampaigns/{id}/events/{eventId}: мероприятия из основного календаря КОНТАКТ;
- brsmCampaigns/{id}/entries/{uid}: посещения и отдельные закреплённые билеты на каждый раунд;
- brsmCampaignQrs/{sha256(token)}: одноразовые QR, связанные с конкретным событием и кампанией;
- brsmCampaigns/{id}/rounds/{roundId}: публичные выпавшие числа и результат;
- brsmCampaigns/{id}/roundPrivate/{roundId}: закрытый реестр участников и журнал действий.

На обратной стороне карты динамически показывается нужное количество посещений, раунды, номера билета и совпадения. Лицевая сторона сохраняет дизайн BALI CARD BRSM, белый логотип, имя и индивидуальный BALI ID. Архивы и отчёты прошлых кампаний сохраняются.

ВАЖНО: лимит на один раунд сейчас 1500 допущенных участников; при превышении понадобится шардирование и проверка максимального размера одного документа Firestore. При большом числе зрителей каждое обновление числа на открытой карте потребляет чтения Firestore. Бесплатность и выдерживаемую нагрузку нельзя гарантировать до нагрузочного теста.

Проведение публичного призового розыгрыша требует согласования применимых требований законодательства Беларуси, проверки 18+ и членства БРСМ. Нельзя рекламировать запуск как состоявшийся до развёртывания функций/правил и репетиции на тестовом Firebase-проекте.

## Shared BALI COIN, prize lots and a special bar menu

All card tiers use one account wallet and the existing private Google Sheets
BALI COIN and История BALI COIN ledgers. BRSM is a card appearance and a way
to earn coins, not a separate coin balance.

- For each KONTAKT event an administrator configures the entry reward manually.
  Setting it to zero disables the reward. A validated BRSM QR check-in then
  triggers an idempotent coin credit for that guest; the Sheets service verifies
  the committed Firebase event entry before crediting anything.
- An administrator can define ACTIVITY rewards and credit a specific BALI ID
  for participating in approved activities at an event.
- Guests can transfer BALI COIN between any two active BALI ID cards, including
  ordinary and BRSM cards. A confirmation shows recipient name and card number.
- The special bar menu and prize lots are separate categories sharing the same
  buying mechanism. Admin sets item name, price in coins, available quantity
  and active status. Purchasing immediately debits the Sheets wallet under
  the shared script lock, reducing available stock.
- Guest receives a unique LOT voucher, visible under My purchases, with
  the issued/served status. A bar staff member verifies the guest's BALI ID,
  confirms the voucher at bali-coin-staff.html, and cannot issue it twice.
- Management controls are inside BRSM admin in a collapsed section so they
  do not stretch the screen on mobile.
- Staff may only fulfill vouchers. Only approved administrators/directors
  (roles in the private Администраторы sheet) can configure rates and prizes.

### Important release limits

The production config bali-sheets-config.js still has
BALI_SHEETS_API_ENABLED=false pending verification of Google Apps Script,
Cloudflare proxy and secrets. GitHub commits alone do not activate the coins.
Google Sheets and Firestore are different stores: QR check-in and coin credit
cannot be a single distributed atomic transaction. Clients retry idempotent
claims after reconnect; admins can manually reconcile failed awards.

At 800 guests, the Apps Script lock serializes transfers and purchases. Test
rush-hour concurrency and free-tier quotas on staging before enabling sales.
An interrupted two-sided transfer requires staff reconciliation and will not
silently retry into a double debit.

BALI COIN is an internal loyalty point and has no monetary exchange value.
If special bar menu items contain alcohol, the bar must verify age and comply
with local restrictions. Chance-based prize promotions require approved
Belarus-specific contest terms before public launch.

### Привязка идентификаторов и работа бара — обязательная проверка до запуска

В текущей архитектуре существуют **две исторические нумерации**: `baliIds/{uid}`
в Firebase и `Карты` в приватной Google-таблице. Оба источника привязаны к
одному Firebase UID, но номера могут различаться. Пока сверка не пройдена,
нельзя считать шестизначные значения взаимозаменяемыми.

- На лицевой стороне BRSM при включённом Sheets-режиме показывается номер
  из подтверждённой обычной BALI ID, а не альтернативный Firebase-счётчик.
- В админке BRSM в поиске карты добавлена защищённая сверка номеров по UID
  через `coinCardIdCheck`. Если они отличаются, директор видит предупреждение.
- **Неразрешённый случай различия номеров — блокирующая задача для запуска
  кампании с реальными призами.** Перед публикацией нужно согласовать
  единый канонический ID для выдачи BRSM, лотерейных билетов и обмена COIN.
  Нельзя автоматически перенумеровывать действующих гостей без миграции.
- Выдача напитка и приза проверяет существование оплаченного ваучера именно
  у владельца указанной Sheets BALI ID; факт повторной выдачи сохраняется
  в приватной таблице.
- Сотрудник может открыть отдельный `bali-coin-staff.html`, войти через
  Google **либо через существующий Firebase логин/пароль `staff01`**, если
  этот аккаунт действительно создан и ему назначена отдельная роль
  `staff` в приватной таблице «Администраторы». Роль preorderStaff в
  Firestore сама по себе доступ к таблице не даёт.
- Старый интерфейс `preorders.html` / BALI STAFF не изменён.

**Признак готовности:** сценарий 2 разных аккаунтов и 2 карт:
начисление за QR-отметку, 1 перевод COIN туда и обратно, 1 покупка бара,
погашение сотрудником, запрет повторного списания/выдачи,
закрытие всех раундов кампании, контроль баланса и архива.
До тестирования не переключать `BALI_SHEETS_API_ENABLED=false` на true.

Покупки и переводы защищены повторным ID запроса: после сетевого тайм-аута
клиент пытается повторно отправить **ту же операцию**, а не новую. Операции
перевода записываются двумя строками в один пакетный вызов Google Sheets,
после чего обновляются кэшированные остатки.

### Безопасная работа с номером BALI ID в панели директора

Добавлена единая процедура `brsm-id-resolver.js`: если режим Google Sheets
включён, формы назначения BRSM-карты и ручной корректировки посещения
сначала запрашивают `coinResolveCard` у приватного Sheets backend. Он
проверяет роль директора и возвращает неизменный Firebase UID владельца
указанного шестизначного номера. Затем Firebase Callable Function
производит действие **по UID**, а не по потенциально другому номеру
из Firebase. При отключённом Sheets сохраняется прежняя механика
поиска по `baliIds.number`.

Сами номера при этом **не перенумеровываются**. Существующий сервер
лотереи по-прежнему фиксирует номер из Firebase на момент начала раунда.
Если номер в Sheets отличается, возможна разница между лицевой стороной
карты и протоколом победителя. Поэтому запуск публичного розыгрыша
**остаётся заблокированным регламентом релиза** до сверки и миграции.
Тесты проверяют разрешение номера в UID, запрет поиска посторонним и
сохранение исходного номера в Firebase.

Функционал сохранён только в PR: текущий `BALI_SHEETS_API_ENABLED=false`,
произвольное включение интеграции без синхронизации ID, проверки прав,
проверки лимитов/квот Apps Script и тестовой смены призов запрещено.
