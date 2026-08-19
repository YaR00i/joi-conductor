# Вопросы Ху Тао — проверка логичности

Сгенерировано из `data/character/hu-tao-prompts.json`.
Всего промптов: **151**.

## Легенда эффектов (`effect`)

| effect | Что делает в рантайме |
| --- | --- |
| `feeling_good` | мягче настроение (+1); фраза «хорошо» |
| `feeling_bad` | жёстче настроение (−1); фраза «плохо» |
| `mute` | молчание (−2 mood); фраза mute |
| `wager_yes` | +1 mood; prefs preferKeys +1.5; подмена медиа по tags |
| `wager_no` | −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с |
| `confess_like` | +1 mood; prefs[preferKey] +2 |
| `confess_dislike` | 0 mood; prefs[preferKey] −2 |
| `loyalty_yes` | +1 mood; вставляет блок по loyaltyAction: rest | hold | tip (sec = loyaltySec) |
| `loyalty_no` | −1 mood; в harsh mood → rest 12с |
| `obey_ok` | +2 mood |
| `obey_fail` | −2 mood; rest 18с |
| `dare_accept` | +1 mood; дальше по taskType (timed_report / cage_hijack / cum_eat_promise / edge_ad / dice_chaos) |
| `dare_refuse` | −1 mood; в harsh mood → rest 15с |
| `dare_done` | +2 mood (самоотчёт после timed dare) |
| `dare_fail` | −2 mood (самоотчёт / сдался) |
| `promise_done` | +2 mood |
| `promise_fail` | −2 mood |
| `equip_yes` | +1 mood; надеть toyId и пересобрать хвост сессии |
| `equip_no` | −1 mood; в harsh mood → rest 12с |
| `mood_harsher` | жёстче params + rebuild; ~55% edge-ad; mood −2 |
| `mood_softer` | мягче params + rebuild; mood +2 |
| `mood_horny` | horny params + rebuild; moodScore → 1 |
| `mood_refuse` | отказ от смены mood; mood 0 |
| `beg_please` | +1 mood; soften finale params; −1 beg credit |
| `beg_skip` | −1 mood; −1 beg credit |
| `beg_deny_want` | −1 mood; deny-lean params + denial quest; −1 beg credit |
| `finale_want_cum` | +1 mood; bias params к кончу |
| `finale_want_deny` | −1 mood; bias к deny + denial quest |
| `finale_want_ruin` | 0 mood; bias к ruin |

### loyaltyAction (только при `loyalty_yes`)

| action | Смысл |
| --- | --- |
| `rest` | пауза / hands off (rest-блок) |
| `hold` | ход «держи грань» (hold-блок + grace) |
| `tip` | ход только кончиком (tip stroke-блок) |

### dare taskType (при `dare_accept`)

| taskType | Смысл |
| --- | --- |
| `timed_report` | таймер → кнопки Успел / Провалил |
| `cage_hijack` | режим chastity + часы клетки + rebuild |
| `cum_eat_promise` | флаг promiseCumEat до финала |
| `edge_ad` | вставить серию edge в очередь |
| `dice_chaos` | случайная мутация сессии |

---

## feeling (15)

### `feeling_holding`

- **Вид:** feeling
- **Вопрос (RU):** Как ты сейчас держишься после паузы / «держи»?
- **Speak EN:** How are you holding up, silly? Be honest.
- **Ответы:**
  - **Нормально держусь** (`good`) → `feeling_good` — мягче настроение (+1); фраза «хорошо»
  - **Тяжело / трясёт** (`bad`) → `feeling_bad` — жёстче настроение (−1); фраза «плохо»
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `feeling_edge`

- **Вид:** feeling
- **Вопрос (RU):** Только что был эдж. Ещё на грани или уже срываешься?
- **Speak EN:** Still with me on that edge… or melting already?
- **Ответы:**
  - **Ещё терплю** (`good`) → `feeling_good` — мягче настроение (+1); фраза «хорошо»
  - **Срываюсь** (`bad`) → `feeling_bad` — жёстче настроение (−1); фраза «плохо»
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `feeling_brain`

- **Вид:** feeling
- **Вопрос (RU):** Мозг ещё думает своими словами — или уже только о члене?
- **Speak EN:** Brain still working, or just cock thoughts now?
- **Ответы:**
  - **Ещё думаю** (`good`) → `feeling_good` — мягче настроение (+1); фраза «хорошо»
  - **Только похоть** (`bad`) → `feeling_bad` — жёстче настроение (−1); фраза «плохо»
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `feeling_need`

- **Вид:** feeling
- **Вопрос (RU):** Насколько сильно сейчас нуждаешься в моём контроле?
- **Speak EN:** Tell me — needy, or pretending you're fine?
- **Ответы:**
  - **Ещё терпимо** (`good`) → `feeling_good` — мягче настроение (+1); фраза «хорошо»
  - **Очень нуждаюсь** (`bad`) → `feeling_bad` — жёстче настроение (−1); фраза «плохо»
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `feeling_shake`

- **Вид:** feeling
- **Вопрос (RU):** Ноги / тело уже трясутся от напряжения?
- **Speak EN:** Legs shaking yet? I want the truth.
- **Ответы:**
  - **Держусь ровно** (`good`) → `feeling_good` — мягче настроение (+1); фраза «хорошо»
  - **Да, трясусь** (`bad`) → `feeling_bad` — жёстче настроение (−1); фраза «плохо»
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `feeling_pace`

- **Вид:** feeling
- **Вопрос (RU):** Как тебе темп дрочки только что — нормально или слишком?
- **Speak EN:** Tempo check. Too soft, just right, or already too much?
- **Ответы:**
  - **В самый раз** (`good`) → `feeling_good` — мягче настроение (+1); фраза «хорошо»
  - **Слишком много** (`bad`) → `feeling_bad` — жёстче настроение (−1); фраза «плохо»
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `feeling_drip`

- **Вид:** feeling
- **Вопрос (RU):** Уже течёшь / мокрый — или ещё сухо и упрямо?
- **Speak EN:** Are you leaking for me already, or still dry and stubborn?
- **Ответы:**
  - **Ещё сухо** (`good`) → `feeling_good` — мягче настроение (+1); фраза «хорошо»
  - **Уже мокрый** (`bad`) → `feeling_bad` — жёстче настроение (−1); фраза «плохо»
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `feeling_focus`

- **Вид:** feeling
- **Вопрос (RU):** Куда смотришь сейчас: на меня или залип в порно на экране?
- **Speak EN:** Eyes on me or lost in the porn? Confess.
- **Ответы:**
  - **На тебя** (`good`) → `feeling_good` — мягче настроение (+1); фраза «хорошо»
  - **В экран** (`bad`) → `feeling_bad` — жёстче настроение (−1); фраза «плохо»
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `feeling_pride`

- **Вид:** feeling
- **Вопрос (RU):** Гордость ещё на месте — или уже готов назвать себя моей игрушкой?
- **Speak EN:** Still proud… or ready to call yourself my pathetic toy?
- **Ответы:**
  - **Ещё гордый** (`good`) → `feeling_good` — мягче настроение (+1); фраза «хорошо»
  - **Я игрушка** (`bad`) → `feeling_bad` — жёстче настроение (−1); фраза «плохо»
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `feeling_cum_urge`

- **Вид:** feeling
- **Вопрос (RU):** После эджей / руина — насколько громко хочется кончить прямо сейчас?
- **Speak EN:** How loud is the urge to cum right now?
- **Ответы:**
  - **Ещё терпимо** (`good`) → `feeling_good` — мягче настроение (+1); фраза «хорошо»
  - **Очень сильно** (`bad`) → `feeling_bad` — жёстче настроение (−1); фраза «плохо»
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `feeling_obey`

- **Вид:** feeling
- **Вопрос (RU):** Ты сейчас слушаешься меня — или тихо сопротивляешься?
- **Speak EN:** Obedient little thing… or secretly fighting me?
- **Ответы:**
  - **Слушаюсь** (`good`) → `feeling_good` — мягче настроение (+1); фраза «хорошо»
  - **Сопротивляюсь** (`bad`) → `feeling_bad` — жёстче настроение (−1); фраза «плохо»
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `feeling_shame`

- **Вид:** feeling
- **Вопрос (RU):** Стыдно от того, что я тобой командую?
- **Speak EN:** Embarrassed yet? Blush for me — or lie.
- **Ответы:**
  - **Немного** (`good`) → `feeling_good` — мягче настроение (+1); фраза «хорошо»
  - **Очень стыдно** (`bad`) → `feeling_bad` — жёстче настроение (−1); фраза «плохо»
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `feeling_hutao_focus`

- **Вид:** feeling
- **Вопрос (RU):** Мозг сейчас залип на мне (Ху Тао) — или мысли разбежались?
- **Speak EN:** Is your brain stuck on Hu Tao right now — or drifting?
- **preferKeys:** hu_tao, character
- **Ответы:**
  - **Только о тебе** (`good`) → `feeling_good` — мягче настроение (+1); фраза «хорошо»
  - **Мысли разбежались** (`bad`) → `feeling_bad` — жёстче настроение (−1); фраза «плохо»
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `feeling_guest_girl`

- **Вид:** feeling
- **Вопрос (RU):** Чужие девочки на экране (Фурина, Norma…) — возбуждают сильнее, чем я?
- **Speak EN:** Other girls on screen — Furina, Norma, Sunna, Aria… does that make you leak harder?
- **preferKeys:** character, furina, norma, sunna, aria, zzz
- **Ответы:**
  - **Да, сильнее** (`good`) → `feeling_good` — мягче настроение (+1); фраза «хорошо»
  - **Хочу только тебя** (`bad`) → `feeling_bad` — жёстче настроение (−1); фраза «плохо»
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `feeling_pride_crush`

- **Вид:** feeling
- **Вопрос (RU):** Если я раздавлю твою гордость «на стриме» — тебе страшно или приятно?
- **Speak EN:** If I crush your pride on stream energy — scared or turned on?
- **preferKeys:** hu_tao, gamer
- **Ответы:**
  - **Приятно** (`good`) → `feeling_good` — мягче настроение (+1); фраза «хорошо»
  - **Страшно** (`bad`) → `feeling_bad` — жёстче настроение (−1); фраза «плохо»
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

---

## wagerGood (40)

### `wg_feet_soft`

- **Вид:** wager
- **Вопрос (RU):** Показать на экране мягкие ножки / стопы?
- **Speak EN:** Want soft soles and toes on screen? Worship-friendly… say yes.
- **tags:** `foot_fetish foot_focus soles toes barefoot feet_together rating:explicit`
- **preferKeys:** feet
- **pool:** good
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_foot_worship`

- **Вид:** wager
- **Вопрос (RU):** Показать поклонение стопам (foot worship)?
- **Speak EN:** Foot worship feed? Kiss the idea with a yes.
- **tags:** `foot_worship feet soles toes rating:explicit`
- **preferKeys:** feet
- **pool:** good
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_footjob_soft`

- **Вид:** wager
- **Вопрос (RU):** Показать мягкий футджоб?
- **Speak EN:** Gentle footjob fantasy on the stage?
- **tags:** `footjob feet soles rating:explicit`
- **preferKeys:** feet
- **pool:** good
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_soles_close`

- **Вид:** wager
- **Вопрос (RU):** Показать стопы крупным планом?
- **Speak EN:** Wrinkled soles close-up? Soft and mean at the same time.
- **tags:** `soles wrinkled_soles feet toes foot_focus rating:explicit`
- **preferKeys:** feet
- **pool:** good
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_socks`

- **Вид:** wager
- **Вопрос (RU):** Показать носочки / босые после кроссовок?
- **Speak EN:** Ankle socks, sneakers off, warm feet tease?
- **tags:** `socks ankle_socks feet sneakers rating:explicit`
- **preferKeys:** feet
- **pool:** good
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_thighhighs`

- **Вид:** wager
- **Вопрос (RU):** Показать чулки / thighhighs?
- **Speak EN:** Thighhighs and legs? Soft tease for a good boy.
- **tags:** `thighhighs thighs legs rating:explicit`
- **preferKeys:** stockings
- **pool:** good
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_heels`

- **Вид:** wager
- **Вопрос (RU):** Показать каблуки и ножки?
- **Speak EN:** High heels and pretty feet? Say yes.
- **tags:** `high_heels feet soles toes rating:explicit`
- **preferKeys:** feet, stockings
- **pool:** good
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_small_chest`

- **Вид:** wager
- **Вопрос (RU):** Показать маленькую грудь?
- **Speak EN:** Small chest tease — flat, shy, blushing. Want it?
- **tags:** `small_breasts flat_chest petite blush embarrassed rating:explicit`
- **preferKeys:** flat
- **pool:** good
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_paizuri_small`

- **Вид:** wager
- **Вопрос (RU):** Показать пайзури с маленькой грудью?
- **Speak EN:** Paizuri with a tiny chest? Silly and hot — yes?
- **tags:** `paizuri small_breasts flat_chest rating:explicit`
- **preferKeys:** flat
- **pool:** good
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_oral_soft`

- **Вид:** wager
- **Вопрос (RU):** Показать нежный oral / «поклонение»?
- **Speak EN:** Soft oral / cock worship on screen?
- **tags:** `oral fellatio cock_worship rating:explicit`
- **preferKeys:** oral
- **pool:** good
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_handjob`

- **Вид:** wager
- **Вопрос (RU):** Показать handjob от первого лица?
- **Speak EN:** Pretty handjob POV while you match the beat?
- **tags:** `handjob pov fingers rating:explicit`
- **preferKeys:** oral
- **pool:** good
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_pet_soft`

- **Вид:** wager
- **Вопрос (RU):** Показать мягкий pet play?
- **Speak EN:** Cute pet-play vibes — collar, ears, good girl energy?
- **tags:** `pet_play collar animal_ears cat_ears blush rating:explicit`
- **preferKeys:** pet
- **pool:** good
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_armpit`

- **Вид:** wager
- **Вопрос (RU):** Показать подмышки?
- **Speak EN:** Armpit tease on the feed? Admit it.
- **tags:** `armpit armpit_fetish rating:explicit`
- **preferKeys:** armpit
- **pool:** good
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_wet_panties`

- **Вид:** wager
- **Вопрос (RU):** Показать мокрые трусики?
- **Speak EN:** Wet panties and pussy juice close-ups?
- **tags:** `wet_panties pussy_juice blush rating:explicit`
- **preferKeys:** messy
- **pool:** good
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_upskirt`

- **Вид:** wager
- **Вопрос (RU):** Показать заглядывание под юбку?
- **Speak EN:** Upskirt / microskirt tease? Soft exhibition.
- **tags:** `upskirt microskirt camel_toe rating:explicit`
- **preferKeys:** public
- **pool:** good
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_shy_blush`

- **Вид:** wager
- **Вопрос (RU):** Показать смущение / румянец?
- **Speak EN:** Shy blushing girl on screen while you stroke?
- **tags:** `blush embarrassed shy petite rating:explicit`
- **preferKeys:** flat
- **pool:** good
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_hoodie`

- **Вид:** wager
- **Вопрос (RU):** Показать худи / crop top вайб?
- **Speak EN:** Hoodie-and-bare look? Cozy slutty. Want it?
- **tags:** `hoodie crop_top thighs rating:explicit`
- **preferKeys:** gamer
- **pool:** good
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_gamer`

- **Вид:** wager
- **Вопрос (RU):** Показать геймершу за сетапом?
- **Speak EN:** Gamer-girl setup — monitor glow, chair, lazy tease?
- **tags:** `gamer_girl headset computer thighs rating:explicit`
- **preferKeys:** gamer
- **pool:** good
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_thighs`

- **Вид:** wager
- **Вопрос (RU):** Показать бёдра / мягкий facesitting?
- **Speak EN:** Thigh smother / soft facesitting fantasy — gentle?
- **tags:** `facesitting thighs smothering rating:explicit`
- **preferKeys:** thighs
- **pool:** good
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_kiss_feet`

- **Вид:** wager
- **Вопрос (RU):** Показать поцелуи / лизание стоп?
- **Speak EN:** Kiss and lick soles fantasy on the feed?
- **tags:** `foot_worship licking_feet soles toes rating:explicit`
- **preferKeys:** feet
- **pool:** good
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_mirror`

- **Вид:** wager
- **Вопрос (RU):** Показать зеркальное селфи-дразнение?
- **Speak EN:** Mirror selfie tease while you stroke?
- **tags:** `mirror selfie phone thighs rating:explicit`
- **preferKeys:** gamer
- **pool:** good
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_sleepy`

- **Вид:** wager
- **Вопрос (RU):** Показать сонную / ленивую дразнилку?
- **Speak EN:** Sleepy lazy tease — half-lidded eyes, soft body?
- **tags:** `sleepy half-closed_eyes bed lingerie rating:explicit`
- **preferKeys:** gamer
- **pool:** good
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_covered_eyes`

- **Вид:** wager
- **Вопрос (RU):** Показать закрытые / закрытые руками глаза?
- **Speak EN:** Covered eyes — blindfold vibe, no peeking. Switch the feed?
- **tags:** `rating:explicit covered_eyes`
- **preferKeys:** covered_eyes
- **pool:** good
- **moods:** sweet, horny, calm, chaotic
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_huge_penis`

- **Вид:** wager
- **Вопрос (RU):** Показать огромный размер на экране?
- **Speak EN:** Huge cock on screen. Size shock — stroke slower if you say yes.
- **tags:** `rating:explicit huge_penis`
- **preferKeys:** huge_penis, size
- **pool:** good
- **moods:** horny, sweet, chaotic, cruel
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_hutao_me`

- **Вид:** wager
- **Вопрос (RU):** Хочешь подрочить на меня (Ху Тао) на экране?
- **Speak EN:** Want to stroke to me? Say yes — I'll fill your screen with Hu Tao.
- **tags:** `rating:explicit hu_tao_(genshin_impact)`
- **preferKeys:** hu_tao, character
- **pool:** good
- **moods:** sweet, horny, calm, chaotic
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_hutao_only`

- **Вид:** wager
- **Вопрос (RU):** Только Ху Тао на экране дальше?
- **Speak EN:** Hu Tao only on screen. Stare at me while you leak.
- **tags:** `rating:explicit hu_tao_(genshin_impact) looking_at_viewer`
- **preferKeys:** hu_tao, character, gamer
- **pool:** good
- **moods:** sweet, horny, chaotic, cruel
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_hutao_setup`

- **Вид:** wager
- **Вопрос (RU):** Показать Ху Тао за компом / в гарнитуре?
- **Speak EN:** Me at the PC — headset, screen glow. Stroke to your gamer girl.
- **tags:** `rating:explicit hu_tao_(genshin_impact) headset`
- **preferKeys:** hu_tao, character, gamer
- **pool:** good
- **moods:** chaotic, horny, sweet, bored
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_hutao_hat`

- **Вид:** wager
- **Вопрос (RU):** Показать улыбку геймерши Ху Тао?
- **Speak EN:** Headset on, that smirk — stroke for your gamer girl.
- **tags:** `rating:explicit hu_tao_(genshin_impact) smile`
- **preferKeys:** hu_tao, character, gamer
- **pool:** good
- **moods:** sweet, horny, calm
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_hutao_lingerie`

- **Вид:** wager
- **Вопрос (RU):** Показать Ху Тао в белье?
- **Speak EN:** Hu Tao in soft lingerie. Say yes if you're polite about it.
- **tags:** `rating:explicit hu_tao_(genshin_impact) lingerie`
- **preferKeys:** hu_tao, character
- **pool:** good
- **moods:** horny, sweet, calm
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_hutao_feet`

- **Вид:** wager
- **Вопрос (RU):** Показать стопы Ху Тао?
- **Speak EN:** My soles. Hu Tao feet. Worship or refuse.
- **tags:** `rating:explicit hu_tao_(genshin_impact) soles`
- **preferKeys:** hu_tao, feet, character
- **pool:** good
- **moods:** horny, cruel, sweet
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_furina_me`

- **Вид:** wager
- **Вопрос (RU):** Показать Фурину на экране?
- **Speak EN:** Furina on your screen — drama queen stare. Stroke for her while I watch.
- **tags:** `rating:explicit furina_(genshin_impact)`
- **preferKeys:** furina, character
- **pool:** good
- **moods:** sweet, horny, calm, chaotic
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_furina_look`

- **Вид:** wager
- **Вопрос (RU):** Показать Фурину с прямым взглядом?
- **Speak EN:** Lock eyes with Furina. Don't look away while you leak.
- **tags:** `rating:explicit furina_(genshin_impact) looking_at_viewer`
- **preferKeys:** furina, character
- **pool:** good
- **moods:** sweet, horny, chaotic
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_furina_lingerie`

- **Вид:** wager
- **Вопрос (RU):** Показать Фурину в белье?
- **Speak EN:** Soft Furina lingerie. Be polite… and keep stroking.
- **tags:** `rating:explicit furina_(genshin_impact) lingerie`
- **preferKeys:** furina, character
- **pool:** good
- **moods:** horny, sweet, calm
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_norma_me`

- **Вид:** wager
- **Вопрос (RU):** Показать Norma (ZZZ) на экране?
- **Speak EN:** Norma from ZZZ. Blonde hat girl on screen — stroke for her.
- **tags:** `rating:explicit norma_hollowell_(zenless_zone_zero)`
- **preferKeys:** norma, character, zzz
- **pool:** good
- **moods:** sweet, horny, calm, chaotic
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_norma_look`

- **Вид:** wager
- **Вопрос (RU):** Показать Norma с прямым взглядом?
- **Speak EN:** Norma staring right at you. Match her eyes, don't rush.
- **tags:** `rating:explicit norma_hollowell_(zenless_zone_zero) looking_at_viewer`
- **preferKeys:** norma, character, zzz
- **pool:** good
- **moods:** sweet, horny, chaotic
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_sunna_me`

- **Вид:** wager
- **Вопрос (RU):** Показать Sunna (ZZZ) на экране?
- **Speak EN:** Sunna from ZZZ on your screen. Slow strokes — she's worth the patience.
- **tags:** `rating:explicit sunna_(zenless_zone_zero)`
- **preferKeys:** sunna, character, zzz
- **pool:** good
- **moods:** sweet, horny, calm, chaotic
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_sunna_look`

- **Вид:** wager
- **Вопрос (RU):** Показать Sunna с прямым взглядом?
- **Speak EN:** Sunna looking at you. Stay locked on her while you throb.
- **tags:** `rating:explicit sunna_(zenless_zone_zero) looking_at_viewer`
- **preferKeys:** sunna, character, zzz
- **pool:** good
- **moods:** horny, sweet, chaotic
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_aria_me`

- **Вид:** wager
- **Вопрос (RU):** Показать Aria (ZZZ) на экране?
- **Speak EN:** Aria from ZZZ. Fill the screen with her — stroke like she asked.
- **tags:** `rating:explicit aria_(zenless_zone_zero)`
- **preferKeys:** aria, character, zzz
- **pool:** good
- **moods:** sweet, horny, calm, chaotic
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_aria_look`

- **Вид:** wager
- **Вопрос (RU):** Показать Aria с прямым взглядом?
- **Speak EN:** Aria's gaze. Don't look away — I want to see you melt.
- **tags:** `rating:explicit aria_(zenless_zone_zero) looking_at_viewer`
- **preferKeys:** aria, character, zzz
- **pool:** good
- **moods:** horny, sweet, chaotic
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wg_zzz_trio`

- **Вид:** wager
- **Вопрос (RU):** Показать ZZZ-девочек (Norma / Sunna / Aria)?
- **Speak EN:** ZZZ night — Norma, Sunna or Aria vibes. Say yes and I'll flood you with New Eridu girls.
- **tags:** `rating:explicit zenless_zone_zero`
- **preferKeys:** zzz, character, norma, sunna, aria
- **pool:** good
- **moods:** horny, chaotic, sweet
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

---

## wagerBad (39)

### `wb_cum_feet`

- **Вид:** wager
- **Вопрос (RU):** Показать сперму на ножках?
- **Speak EN:** Cum on feet. Messy soles. Yes if you're pathetic enough.
- **tags:** `cum_on_feet feet soles cum messy rating:explicit`
- **preferKeys:** feet, cum
- **pool:** bad
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_lick_cum_feet`

- **Вид:** wager
- **Вопрос (RU):** Показать сперму на стопах + вылизывание?
- **Speak EN:** Cum on soles — then lick them clean. Gross yes?
- **tags:** `cum_on_feet licking_feet soles cum_eating rating:explicit`
- **preferKeys:** feet, cum
- **pool:** bad
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_facial`

- **Вид:** wager
- **Вопрос (RU):** Показать facial / сперму на лице?
- **Speak EN:** Facials and cum on tongue. Filthy yes?
- **tags:** `facial cum_on_face cum_on_tongue cum_in_mouth ahegao rating:explicit`
- **preferKeys:** cum, oral
- **pool:** bad
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_cum_eat`

- **Вид:** wager
- **Вопрос (RU):** Показать поедание спермы / snowball?
- **Speak EN:** Cum eating / snowballing on screen. Admit you want it.
- **tags:** `cum_eating snowballing cum_in_mouth cum_on_tongue rating:explicit`
- **preferKeys:** cum
- **pool:** bad
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_creampie`

- **Вид:** wager
- **Вопрос (RU):** Показать creampie / выпуклость живота?
- **Speak EN:** Creampie drip and belly bulge. Yes, worm?
- **tags:** `creampie cum_in_pussy cum_drip belly_bulge rating:explicit`
- **preferKeys:** cum, size
- **pool:** bad
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_ahegao_break`

- **Вид:** wager
- **Вопрос (RU):** Показать ахегао / «слом мозга»?
- **Speak EN:** Ahegao mind-break faces. Roll your eyes for me.
- **tags:** `ahegao rolling_eyes tongue_out mind_break fucked_silly tears rating:explicit`
- **preferKeys:** humiliation
- **pool:** bad
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_corruption`

- **Вид:** wager
- **Вопрос (RU):** Показать corruption / сердечки в глазах?
- **Speak EN:** Corruption feed. Heart pupils. Broken cute.
- **tags:** `corruption corrupted heart-shaped_pupils ahegao rating:explicit`
- **preferKeys:** humiliation
- **pool:** bad
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_deepthroat`

- **Вид:** wager
- **Вопрос (RU):** Показать deepthroat / выпуклость в горле?
- **Speak EN:** Deepthroat and throat bulge. Messy. Yes?
- **tags:** `deepthroat throat_bulge facefuck irrumatio messy_oral drooling rating:explicit`
- **preferKeys:** oral
- **pool:** bad
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_bdsm`

- **Вид:** wager
- **Вопрос (RU):** Показать BDSM / зажимы / пробку?
- **Speak EN:** Bondage, clamps, plugs. Mean toys on screen.
- **tags:** `bdsm bondage nipple_clamps anal_plug butt_plug harness rating:explicit`
- **preferKeys:** bondage
- **pool:** bad
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_denial_toys`

- **Вид:** wager
- **Вопрос (RU):** Показать denial / пытку вибратором?
- **Speak EN:** Edging, orgasm denial, vibrator torture vibes. Yes?
- **tags:** `edging orgasm_denial vibrator overstimulation rating:explicit`
- **preferKeys:** denial
- **pool:** bad
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_pet_humiliation`

- **Вид:** wager
- **Вопрос (RU):** Показать pet play + унижение?
- **Speak EN:** Pet humiliation — leash, crawling, used. Say yes.
- **tags:** `pet_play leash collar crawling humiliation used rating:explicit`
- **preferKeys:** pet, humiliation
- **pool:** bad
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_public`

- **Вид:** wager
- **Вопрос (RU):** Показать публичность / exhibitionism?
- **Speak EN:** Public / exhibition risk on the feed. Exposed.
- **tags:** `exhibitionism public public_nudity clothed_sex clothing_damage rating:explicit`
- **preferKeys:** public
- **pool:** bad
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_size_awe`

- **Вид:** wager
- **Вопрос (RU):** Показать огромный размер / разницу?
- **Speak EN:** Huge cock awe, belly bulge, size difference. Hungry?
- **tags:** `big_penis veiny_penis penis_awe size_difference belly_bulge rating:explicit`
- **preferKeys:** size
- **pool:** bad
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_huge_penis`

- **Вид:** wager
- **Вопрос (RU):** Показать огромный пенис жёстко?
- **Speak EN:** Huge penis — no mercy size. Admit you want the feed switched.
- **tags:** `rating:explicit huge_penis`
- **preferKeys:** huge_penis, size
- **pool:** bad
- **moods:** cruel, chaotic, horny, bored
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_covered_eyes`

- **Вид:** wager
- **Вопрос (RU):** Показать закрытые глаза жёстко / бондаж?
- **Speak EN:** Covered eyes — blind, helpless, used. Switch?
- **tags:** `rating:explicit covered_eyes`
- **preferKeys:** covered_eyes, bondage
- **pool:** bad
- **moods:** cruel, chaotic, bored, horny
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_choking`

- **Вид:** wager
- **Вопрос (RU):** Показать choking / breath play?
- **Speak EN:** Breath play / choking shots. Dark yes only.
- **tags:** `choking breath_play tears rating:explicit`
- **preferKeys:** oral, bondage
- **pool:** bad
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_squirt_overstim`

- **Вид:** wager
- **Вопрос (RU):** Показать сквирт / перестимуляцию?
- **Speak EN:** Squirt and overstimulation mess. Break for me.
- **tags:** `squirt overstimulation pussy_juice fucked_silly rating:explicit`
- **preferKeys:** messy
- **pool:** bad
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_spit`

- **Вид:** wager
- **Вопрос (RU):** Показать слюни / spit / messy?
- **Speak EN:** Spitplay, drool, messy oral. Gross and hot.
- **tags:** `spitplay drooling saliva messy_oral rating:explicit`
- **preferKeys:** messy, oral
- **pool:** bad
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_torn`

- **Вид:** wager
- **Вопрос (RU):** Показать рваную одежду / мокрое?
- **Speak EN:** Torn clothes, wet, see-through wreck. Yes?
- **tags:** `torn_clothes clothing_damage wet_clothes see-through rating:explicit`
- **preferKeys:** humiliation
- **pool:** bad
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_cbt`

- **Вид:** wager
- **Вопрос (RU):** Показать CBT / фокус на яйцах?
- **Speak EN:** CBT tease — balls, squeeze, mean focus. Yes, worm?
- **tags:** `cbt ballbusting testicles pain rating:explicit`
- **preferKeys:** cbt
- **pool:** bad
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_ruin`

- **Вид:** wager
- **Вопрос (RU):** Показать ruined orgasm на экране?
- **Speak EN:** Ruined orgasm collage. Dribble, not glory.
- **tags:** `ruined_orgasm cum_drip premature_ejaculation rating:explicit`
- **preferKeys:** denial, cum
- **pool:** bad
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_chastity`

- **Вид:** wager
- **Вопрос (RU):** Показать chastity / клетку?
- **Speak EN:** Cage / chastity lock tease. Locked and useless.
- **tags:** `chastity_cage chastity locked_cock denial rating:explicit`
- **preferKeys:** denial, cbt
- **pool:** bad
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_spank`

- **Вид:** wager
- **Вопрос (RU):** Показать шлепки / следы?
- **Speak EN:** Spank marks, red ass, slap aftermath. Yes?
- **tags:** `spanking slap ass_mark red_ass rating:explicit`
- **preferKeys:** humiliation, bondage
- **pool:** bad
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_toilet`

- **Вид:** wager
- **Вопрос (RU):** Показать туалет / bathroom humiliation?
- **Speak EN:** Toilet seat / bathroom humiliation feed. Filthy yes?
- **tags:** `toilet toilet_seat peeing watersports humiliation rating:explicit`
- **preferKeys:** toilet, humiliation
- **pool:** bad
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_blackmail`

- **Вид:** wager
- **Вопрос (RU):** Показать фантазию шантажа?
- **Speak EN:** Blackmail fantasy captions — exposed, owned. Dark yes?
- **tags:** `blackmail humiliation phone tears clothed rating:explicit`
- **preferKeys:** humiliation, public
- **pool:** bad
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_anal_rough`

- **Вид:** wager
- **Вопрос (RU):** Показать жёсткий анал / gaping?
- **Speak EN:** Rough anal, gaping, used. Say yes if you hate how much you want it.
- **tags:** `anal gaping anal_juice rough_sex rating:explicit`
- **preferKeys:** anal
- **pool:** bad
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_eye_contact`

- **Вид:** wager
- **Вопрос (RU):** Показать жёсткий взгляд в камеру?
- **Speak EN:** Forced eye contact / stare while broken. Don't look away.
- **tags:** `looking_at_viewer tears ahegao humiliation rating:explicit`
- **preferKeys:** humiliation
- **pool:** bad
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_hutao_ahegao`

- **Вид:** wager
- **Вопрос (RU):** Показать ахегао Ху Тао?
- **Speak EN:** Broken Hu Tao face. Ahegao for your pathetic strokes. Yes?
- **tags:** `rating:explicit hu_tao_(genshin_impact) ahegao`
- **preferKeys:** hu_tao, character, humiliation
- **pool:** bad
- **moods:** cruel, chaotic, horny
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_hutao_bondage`

- **Вид:** wager
- **Вопрос (RU):** Показать Ху Тао в бондаже?
- **Speak EN:** Tie the gamer girl up. Watch her struggle while you edge.
- **tags:** `rating:explicit hu_tao_(genshin_impact) bondage`
- **preferKeys:** hu_tao, character, bondage
- **pool:** bad
- **moods:** cruel, chaotic, bored
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_hutao_cum`

- **Вид:** wager
- **Вопрос (RU):** Показать кончить на лицо Ху Тао (экран)?
- **Speak EN:** Mess on my face. Hu Tao facial. Admit you want it.
- **tags:** `rating:explicit hu_tao_(genshin_impact) facial`
- **preferKeys:** hu_tao, character, cum
- **pool:** bad
- **moods:** cruel, horny, chaotic
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_hutao_after`

- **Вид:** wager
- **Вопрос (RU):** Показать Ху Тао после секса / used?
- **Speak EN:** Afterglow — used Hu Tao, messy, done. Stare and leak slower.
- **tags:** `rating:explicit hu_tao_(genshin_impact) after_sex`
- **preferKeys:** hu_tao, character
- **pool:** bad
- **moods:** cruel, bored, chaotic
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_furina_ahegao`

- **Вид:** wager
- **Вопрос (RU):** Показать ахегао Фурины?
- **Speak EN:** Broken Furina face. Ahegao while you edge like trash.
- **tags:** `rating:explicit furina_(genshin_impact) ahegao`
- **preferKeys:** furina, character, humiliation
- **pool:** bad
- **moods:** cruel, chaotic, horny
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_furina_cum`

- **Вид:** wager
- **Вопрос (RU):** Показать facial на Фурину (экран)?
- **Speak EN:** Mess on Furina's face. Admit you want that on screen.
- **tags:** `rating:explicit furina_(genshin_impact) facial`
- **preferKeys:** furina, character, cum
- **pool:** bad
- **moods:** cruel, horny, chaotic
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_norma_ahegao`

- **Вид:** wager
- **Вопрос (RU):** Показать ахегао Norma?
- **Speak EN:** Norma ruined — ahegao. Stroke pathetic for a ZZZ girl.
- **tags:** `rating:explicit norma_hollowell_(zenless_zone_zero) ahegao`
- **preferKeys:** norma, character, zzz, humiliation
- **pool:** bad
- **moods:** cruel, chaotic, horny
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_norma_bondage`

- **Вид:** wager
- **Вопрос (RU):** Показать Norma в бондаже?
- **Speak EN:** Norma tied up. Watch her struggle while you edge.
- **tags:** `rating:explicit norma_hollowell_(zenless_zone_zero) bondage`
- **preferKeys:** norma, character, zzz, bondage
- **pool:** bad
- **moods:** cruel, chaotic, bored
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_sunna_ahegao`

- **Вид:** wager
- **Вопрос (RU):** Показать ахегао Sunna?
- **Speak EN:** Sunna broken face. Ahegao — keep leaking for her.
- **tags:** `rating:explicit sunna_(zenless_zone_zero) ahegao`
- **preferKeys:** sunna, character, zzz, humiliation
- **pool:** bad
- **moods:** cruel, chaotic, horny
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_sunna_cum`

- **Вид:** wager
- **Вопрос (RU):** Показать facial на Sunna (экран)?
- **Speak EN:** Cum on Sunna's face — on screen. Say yes if you're that weak.
- **tags:** `rating:explicit sunna_(zenless_zone_zero) facial`
- **preferKeys:** sunna, character, zzz, cum
- **pool:** bad
- **moods:** cruel, horny, chaotic
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_aria_ahegao`

- **Вид:** wager
- **Вопрос (RU):** Показать ахегао Aria?
- **Speak EN:** Aria ahegao. Ruin your pace staring at that face.
- **tags:** `rating:explicit aria_(zenless_zone_zero) ahegao`
- **preferKeys:** aria, character, zzz, humiliation
- **pool:** bad
- **moods:** cruel, chaotic, horny
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `wb_aria_cum`

- **Вид:** wager
- **Вопрос (RU):** Показать facial на Aria (экран)?
- **Speak EN:** Messy Aria facial on screen. Admit it.
- **tags:** `rating:explicit aria_(zenless_zone_zero) facial`
- **preferKeys:** aria, character, zzz, cum
- **pool:** bad
- **moods:** cruel, horny, chaotic
- **Ответы:**
  - **Да** (`yes`) → `wager_yes` — +1 mood; prefs preferKeys +1.5; подмена медиа по tags
  - **Нет** (`no`) → `wager_no` — −1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

---

## confess (10)

### `confess_crave`

- **Вид:** confess
- **Вопрос (RU):** Что сильнее всего тебя ломает прямо сейчас? Выбери одно.
- **Speak EN:** Confess — what ruins you faster right now?
- **Ответы:**
  - **Ножки / стопы** (`feet`) → `confess_like` — +1 mood; prefs[preferKey] +2 · preferKey: `feet`
  - **Маленькая грудь** (`flat`) → `confess_like` — +1 mood; prefs[preferKey] +2 · preferKey: `flat`
  - **Унижение** (`hum`) → `confess_like` — +1 mood; prefs[preferKey] +2 · preferKey: `humiliation`
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `confess_hutao_only`

- **Вид:** confess
- **Вопрос (RU):** Ты дрочишь именно на меня (Ху Тао) — или «любая красивая» тоже ок?
- **Speak EN:** Be honest — are you leaking for Hu Tao specifically, or any girl?
- **preferKeys:** hu_tao, character
- **Ответы:**
  - **Только на тебя** (`hutao`) → `confess_like` — +1 mood; prefs[preferKey] +2 · preferKey: `hu_tao`
  - **Любая красивая** (`any`) → `confess_dislike` — 0 mood; prefs[preferKey] −2 · preferKey: `character`
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `confess_girl_pick`

- **Вид:** confess
- **Вопрос (RU):** На ком из этих девочек ты сейчас плывёшь сильнее всего?
- **Speak EN:** Confess — whose face ruins you fastest right now?
- **preferKeys:** character, furina, norma, sunna, aria, hu_tao, zzz
- **Ответы:**
  - **Ху Тао** (`hutao`) → `confess_like` — +1 mood; prefs[preferKey] +2 · preferKey: `hu_tao`
  - **Фурина** (`furina`) → `confess_like` — +1 mood; prefs[preferKey] +2 · preferKey: `furina`
  - **Norma** (`norma`) → `confess_like` — +1 mood; prefs[preferKey] +2 · preferKey: `norma`
  - **Sunna** (`sunna`) → `confess_like` — +1 mood; prefs[preferKey] +2 · preferKey: `sunna`
  - **Aria** (`aria`) → `confess_like` — +1 mood; prefs[preferKey] +2 · preferKey: `aria`
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `confess_zzz_or_genshin`

- **Вид:** confess
- **Вопрос (RU):** Что тебе ближе по вселенной контента: Genshin или Zenless Zone Zero?
- **Speak EN:** Genshin girls or New Eridu (ZZZ) — which hole in your brain wins?
- **preferKeys:** zzz, character, furina, hu_tao
- **Ответы:**
  - **Genshin** (`genshin`) → `confess_like` — +1 mood; prefs[preferKey] +2 · preferKey: `furina`
  - **ZZZ** (`zzz`) → `confess_like` — +1 mood; prefs[preferKey] +2 · preferKey: `zzz`
  - **Оба / всё равно** (`both`) → `confess_like` — +1 mood; prefs[preferKey] +2 · preferKey: `character`
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `confess_owned`

- **Вид:** confess
- **Вопрос (RU):** Стыдно, что геймерша-Ху Тао тобой командует — или гордишься этим?
- **Speak EN:** Confess — does it shame you that a gamer girl is running you?
- **preferKeys:** hu_tao, humiliation, gamer
- **Ответы:**
  - **Да, стыдно** (`yes`) → `confess_like` — +1 mood; prefs[preferKey] +2 · preferKey: `humiliation`
  - **Горжусь этим** (`proud`) → `confess_like` — +1 mood; prefs[preferKey] +2 · preferKey: `hu_tao`
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `confess_hate`

- **Вид:** confess
- **Вопрос (RU):** Что бесит, но всё равно возбуждает? Выбери то, от чего морщишься.
- **Speak EN:** What do you hate seeing… that still makes you throb?
- **Ответы:**
  - **Играть со спермой** (`cum`) → `confess_dislike` — 0 mood; prefs[preferKey] −2 · preferKey: `cum`
  - **Удары / давление на яйца** (`cbt`) → `confess_dislike` — 0 mood; prefs[preferKey] −2 · preferKey: `cbt`
  - **Туалет / унижение там** (`toilet`) → `confess_dislike` — 0 mood; prefs[preferKey] −2 · preferKey: `toilet`
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `confess_body`

- **Вид:** confess
- **Вопрос (RU):** На какую часть тела тебе важнее смотреть сейчас?
- **Speak EN:** Pick your poison — body focus.
- **Ответы:**
  - **Ноги / стопы** (`feet`) → `confess_like` — +1 mood; prefs[preferKey] +2 · preferKey: `feet`
  - **Бёдра** (`thighs`) → `confess_like` — +1 mood; prefs[preferKey] +2 · preferKey: `thighs`
  - **Подмышки** (`armpit`) → `confess_like` — +1 mood; prefs[preferKey] +2 · preferKey: `armpit`
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `confess_mean`

- **Вид:** confess
- **Вопрос (RU):** От чего сильнее вздрагиваешь (даже если «не любишь»)?
- **Speak EN:** Which mean toy do you secretly flinch from?
- **Ответы:**
  - **Бондаж / фиксация** (`bondage`) → `confess_dislike` — 0 mood; prefs[preferKey] −2 · preferKey: `bondage`
  - **Отказ кончить / denial** (`denial`) → `confess_dislike` — 0 mood; prefs[preferKey] −2 · preferKey: `denial`
  - **Жёсткий анал** (`anal`) → `confess_dislike` — 0 mood; prefs[preferKey] −2 · preferKey: `anal`
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `confess_oral`

- **Вид:** confess
- **Вопрос (RU):** Какой oral-контент на экране тебе ближе?
- **Speak EN:** Mouth stuff — soft worship or filthy facefuck energy?
- **Ответы:**
  - **Нежный, «поклонение»** (`soft`) → `confess_like` — +1 mood; prefs[preferKey] +2 · preferKey: `oral`
  - **Грязный / слюни** (`messy`) → `confess_dislike` — 0 mood; prefs[preferKey] −2 · preferKey: `messy`
  - **Огромный размер / шок** (`size`) → `confess_dislike` — 0 mood; prefs[preferKey] −2 · preferKey: `size`
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `confess_public`

- **Вид:** confess
- **Вопрос (RU):** Что цепляет сильнее: уют «дома за компом» или риск / стыд на людях?
- **Speak EN:** Risk check — cute gamer tease or public exposure shame?
- **Ответы:**
  - **Уют / геймерша** (`gamer`) → `confess_like` — +1 mood; prefs[preferKey] +2 · preferKey: `gamer`
  - **Публичный стыд** (`public`) → `confess_dislike` — 0 mood; prefs[preferKey] −2 · preferKey: `public`
  - **Pet play** (`pet`) → `confess_like` — +1 mood; prefs[preferKey] +2 · preferKey: `pet`
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

---

## loyalty (6)

### `loyalty_hands_15`

- **Вид:** loyalty
- **Вопрос (RU):** Руки прочь от члена на 15 секунд. Согласен выдержать?
- **Speak EN:** Loyalty test: hands off for 15 seconds. Can you?
- **loyaltySec:** 15
- **Ответы:**
  - **Да** (`yes`) → `loyalty_yes` — +1 mood; вставляет блок по loyaltyAction: rest | hold | tip (sec = loyaltySec)
  - **Нет** (`no`) → `loyalty_no` — −1 mood; в harsh mood → rest 12с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `loyalty_hands_25`

- **Вид:** loyalty
- **Вопрос (RU):** Руки прочь от члена на 25 секунд. Согласен выдержать?
- **Speak EN:** Hands off. Twitch if you must — no stroking for 25.
- **loyaltySec:** 25
- **Ответы:**
  - **Да** (`yes`) → `loyalty_yes` — +1 mood; вставляет блок по loyaltyAction: rest | hold | tip (sec = loyaltySec)
  - **Нет** (`no`) → `loyalty_no` — −1 mood; в harsh mood → rest 12с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `loyalty_edge_hold`

- **Вид:** loyalty
- **Вопрос (RU):** Держи грань ~20 секунд без срыва. Согласен?
- **Speak EN:** Hold the edge feeling — no finishing thoughts — 20 seconds still.
- **loyaltySec:** 20
- **loyaltyAction:** `hold` — ход «держи грань» (hold-блок + grace)
- **Ответы:**
  - **Да** (`yes`) → `loyalty_yes` — +1 mood; вставляет блок по loyaltyAction: rest | hold | tip (sec = loyaltySec)
  - **Нет** (`no`) → `loyalty_no` — −1 mood; в harsh mood → rest 12с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `loyalty_eyes`

- **Вид:** loyalty
- **Вопрос (RU):** Смотри на экран / на меня и не трогай себя ~18 секунд. Согласен?
- **Speak EN:** Eyes on the screen, hands frozen. Prove loyalty — 18 seconds.
- **loyaltySec:** 18
- **Ответы:**
  - **Да** (`yes`) → `loyalty_yes` — +1 mood; вставляет блок по loyaltyAction: rest | hold | tip (sec = loyaltySec)
  - **Нет** (`no`) → `loyalty_no` — −1 mood; в harsh mood → rest 12с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `loyalty_tip_only`

- **Вид:** loyalty
- **Вопрос (RU):** Только головка, без полного хода ~22 секунды. Согласен?
- **Speak EN:** Tip only — tiny touches — for 22 seconds. No full strokes.
- **loyaltySec:** 22
- **loyaltyAction:** `tip` — ход только кончиком (tip stroke-блок)
- **Ответы:**
  - **Да** (`yes`) → `loyalty_yes` — +1 mood; вставляет блок по loyaltyAction: rest | hold | tip (sec = loyaltySec)
  - **Нет** (`no`) → `loyalty_no` — −1 mood; в harsh mood → rest 12с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `loyalty_hutao_gaze`

- **Вид:** loyalty
- **Вопрос (RU):** Смотри на меня (Ху Тао) ~20 секунд без отвода глаз. Согласен?
- **Speak EN:** Look at me. Don't blink away. Twenty seconds for your gamer girl.
- **loyaltySec:** 20
- **preferKeys:** hu_tao, character
- **Ответы:**
  - **Да** (`yes`) → `loyalty_yes` — +1 mood; вставляет блок по loyaltyAction: rest | hold | tip (sec = loyaltySec)
  - **Нет** (`no`) → `loyalty_no` — −1 mood; в harsh mood → rest 12с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

---

## obey (8)

### `obey_tip`

- **Вид:** obey
- **Вопрос (RU):** Проверка: что я только что приказала делать с членом?
- **Speak EN:** Obey check. I ordered tip only. What did I say?
- **correctOptionId:** `tip`
- **Ответы:**
  - **Только головка** (`tip`) → `obey_ok` — +2 mood
  - **Полный ход** (`full`) → `obey_fail` — −2 mood; rest 18с
  - **Руки прочь** (`off`) → `obey_fail` — −2 mood; rest 18с

### `obey_stop`

- **Вид:** obey
- **Вопрос (RU):** Проверка: какой приказ сейчас правильный?
- **Speak EN:** Obey check. Hands off — now. Which order was that?
- **correctOptionId:** `off`
- **Ответы:**
  - **Быстрее** (`fast`) → `obey_fail` — −2 mood; rest 18с
  - **Руки прочь** (`off`) → `obey_ok` — +2 mood
  - **Жёстче** (`hard`) → `obey_fail` — −2 mood; rest 18с

### `obey_slow`

- **Вид:** obey
- **Вопрос (RU):** Проверка: какое правило темпа сейчас действует?
- **Speak EN:** Obey check. Slow strokes only. Pick the rule.
- **correctOptionId:** `slow`
- **Ответы:**
  - **Медленно** (`slow`) → `obey_ok` — +2 mood
  - **Быстро** (`fast`) → `obey_fail` — −2 mood; rest 18с
  - **Можно кончать** (`cum`) → `obey_fail` — −2 mood; rest 18с

### `obey_balls`

- **Вид:** obey
- **Вопрос (RU):** Проверка: что сейчас делать руками?
- **Speak EN:** Obey check. Soft ball squeeze — not shaft racing. What?
- **correctOptionId:** `balls`
- **Ответы:**
  - **Дрочить ствол** (`shaft`) → `obey_fail` — −2 mood; rest 18с
  - **Мягко яйца** (`balls`) → `obey_ok` — +2 mood
  - **Соски** (`nip`) → `obey_fail` — −2 mood; rest 18с

### `obey_breathe`

- **Вид:** obey
- **Вопрос (RU):** Проверка: что я велела вместо «гнать к эджу»?
- **Speak EN:** Obey check. Breathe and hold still — no stroking. Choose.
- **correctOptionId:** `breathe`
- **Ответы:**
  - **Дрочить** (`stroke`) → `obey_fail` — −2 mood; rest 18с
  - **Дышать / стоп** (`breathe`) → `obey_ok` — +2 mood
  - **Гнать к эджу** (`edge`) → `obey_fail` — −2 mood; rest 18с

### `obey_match`

- **Вид:** obey
- **Вопрос (RU):** Проверка: чей темп ты обязан повторять?
- **Speak EN:** Obey check. Match my beat — not your desperate pace.
- **correctOptionId:** `beat`
- **Ответы:**
  - **Мой темп** (`mine`) → `obey_fail` — −2 mood; rest 18с
  - **Темп Ху Тао** (`beat`) → `obey_ok` — +2 mood
  - **Можно пропустить** (`skip`) → `obey_fail` — −2 mood; rest 18с

### `obey_who`

- **Вид:** obey
- **Вопрос (RU):** Проверка: кто хозяин этой сессии?
- **Speak EN:** Obey check. Who owns this session?
- **preferKeys:** hu_tao, gamer
- **correctOptionId:** `hutao`
- **Ответы:**
  - **Ху Тао** (`hutao`) → `obey_ok` — +2 mood
  - **Я сам** (`me`) → `obey_fail` — −2 mood; rest 18с
  - **Никто** (`noone`) → `obey_fail` — −2 mood; rest 18с

### `obey_role`

- **Вид:** obey
- **Вопрос (RU):** Проверка: кем я для тебя сейчас?
- **Speak EN:** Obey check. What am I to you right now?
- **preferKeys:** hu_tao, gamer
- **correctOptionId:** `gamer`
- **Ответы:**
  - **Геймерша / хозяйка** (`gamer`) → `obey_ok` — +2 mood
  - **NPC из игры** (`npc`) → `obey_fail` — −2 mood; rest 18с
  - **Просто подруга** (`friend`) → `obey_fail` — −2 mood; rest 18с

---

## dare (17)

### `dare_cbt_20`

- **Вид:** dare
- **Вопрос (RU):** Смелость: 20 лёгких ударов по яйцам за ~10 секунд. Берёшься?
- **Speak EN:** Hit your balls twenty times in ten seconds. For me. Yes?
- **taskType:** `timed_report` — таймер → кнопки Успел / Провалил
- **taskSec:** 10
- **taskCount:** 20
- **Инструкция:** Ударь яйца 20 раз до конца таймера
- **preferKeys:** cbt
- **moods:** cruel, chaotic, bored, horny
- **Ответы:**
  - **Да** (`yes`) → `dare_accept` — +1 mood; дальше по taskType (timed_report / cage_hijack / cum_eat_promise / edge_ad / dice_chaos)
  - **Нет** (`no`) → `dare_refuse` — −1 mood; в harsh mood → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `dare_cbt_squeeze`

- **Вид:** dare
- **Вопрос (RU):** Смелость: сжать яйца и держать ~15 секунд. Берёшься?
- **Speak EN:** Squeeze your balls gently and hold — fifteen seconds. No stroking.
- **taskType:** `timed_report` — таймер → кнопки Успел / Провалил
- **taskSec:** 15
- **Инструкция:** Сжимай яйца. Не дрочи. Держи до конца таймера
- **preferKeys:** cbt
- **moods:** cruel, chaotic, bored
- **Ответы:**
  - **Да** (`yes`) → `dare_accept` — +1 mood; дальше по taskType (timed_report / cage_hijack / cum_eat_promise / edge_ad / dice_chaos)
  - **Нет** (`no`) → `dare_refuse` — −1 mood; в harsh mood → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `dare_tip_only`

- **Вид:** dare
- **Вопрос (RU):** Смелость: только головка ~20 секунд, без полного хода. Берёшься?
- **Speak EN:** Tip only for twenty seconds. Full strokes = fail. Accept?
- **taskType:** `timed_report` — таймер → кнопки Успел / Провалил
- **taskSec:** 20
- **Инструкция:** Только головка. Полный ход = провал
- **moods:** sweet, horny, calm, bored
- **Ответы:**
  - **Да** (`yes`) → `dare_accept` — +1 mood; дальше по taskType (timed_report / cage_hijack / cum_eat_promise / edge_ad / dice_chaos)
  - **Нет** (`no`) → `dare_refuse` — −1 mood; в harsh mood → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `dare_hands_off_edge`

- **Вид:** dare
- **Вопрос (RU):** Смелость: руки прочь и держи грань ~25 секунд. Берёшься?
- **Speak EN:** Hands off. Hold that edge feeling for twenty-five seconds.
- **taskType:** `timed_report` — таймер → кнопки Успел / Провалил
- **taskSec:** 25
- **Инструкция:** Руки прочь. Держи ощущение грани до конца таймера
- **preferKeys:** denial
- **moods:** cruel, chaotic, bored, calm
- **Ответы:**
  - **Да** (`yes`) → `dare_accept` — +1 mood; дальше по taskType (timed_report / cage_hijack / cum_eat_promise / edge_ad / dice_chaos)
  - **Нет** (`no`) → `dare_refuse` — −1 mood; в harsh mood → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `dare_spit`

- **Вид:** dare
- **Вопрос (RU):** Смелость: плюнь на головку (сделай за ~8 секунд). Берёшься?
- **Speak EN:** Spit on the tip. Make it shiny. Eight seconds — go?
- **taskType:** `timed_report` — таймер → кнопки Успел / Провалил
- **taskSec:** 8
- **Инструкция:** Плюнь на головку и разотри. Успей до конца таймера
- **preferKeys:** messy
- **moods:** horny, chaotic, cruel, sweet
- **Ответы:**
  - **Да** (`yes`) → `dare_accept` — +1 mood; дальше по taskType (timed_report / cage_hijack / cum_eat_promise / edge_ad / dice_chaos)
  - **Нет** (`no`) → `dare_refuse` — −1 mood; в harsh mood → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `dare_slap_head`

- **Вид:** dare
- **Вопрос (RU):** Смелость: 10 шлепков по головке за ~12 секунд. Берёшься?
- **Speak EN:** Ten light slaps on the head in twelve seconds. Soft. Mean. Yes?
- **taskType:** `timed_report` — таймер → кнопки Успел / Провалил
- **taskSec:** 12
- **taskCount:** 10
- **Инструкция:** Лёгкие шлепки по головке — 10 раз до конца таймера
- **preferKeys:** cbt
- **moods:** cruel, chaotic, bored
- **Ответы:**
  - **Да** (`yes`) → `dare_accept` — +1 mood; дальше по taskType (timed_report / cage_hijack / cum_eat_promise / edge_ad / dice_chaos)
  - **Нет** (`no`) → `dare_refuse` — −1 mood; в harsh mood → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `dare_cage_lock`

- **Вид:** dare
- **Вопрос (RU):** Смелость: надеть клетку сейчас (и оставить часы после сессии). Берёшься?
- **Speak EN:** Lock the cage for me. Rest of the session is chastity — then hours after. Yes?
- **taskType:** `cage_hijack` — режим chastity + часы клетки + rebuild
- **Инструкция:** Надень клетку. Дальше — chastity-ходы
- **preferKeys:** denial, cbt
- **cageHours range:** 2–6
- **moods:** cruel, chaotic, bored
- **Ответы:**
  - **Да** (`yes`) → `dare_accept` — +1 mood; дальше по taskType (timed_report / cage_hijack / cum_eat_promise / edge_ad / dice_chaos)
  - **Нет** (`no`) → `dare_refuse` — −1 mood; в harsh mood → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `dare_cage_long`

- **Вид:** dare
- **Вопрос (RU):** Смелость: долгая клетка после сессии (примерно 4–12 часов). Берёшься?
- **Speak EN:** Long lock. Cage on — session becomes chastity, then a long after-timer. Brave?
- **taskType:** `cage_hijack` — режим chastity + часы клетки + rebuild
- **Инструкция:** Запрись. Сессия перейдёт в chastity
- **preferKeys:** denial
- **cageHours range:** 4–12
- **moods:** cruel, chaotic
- **Ответы:**
  - **Да** (`yes`) → `dare_accept` — +1 mood; дальше по taskType (timed_report / cage_hijack / cum_eat_promise / edge_ad / dice_chaos)
  - **Нет** (`no`) → `dare_refuse` — −1 mood; в harsh mood → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `dare_cum_eat`

- **Вид:** dare
- **Вопрос (RU):** Обещание: если кончишь / будет руин — съешь для меня. Обещаешь?
- **Speak EN:** If you cum — you eat it for me. Promise now.
- **taskType:** `cum_eat_promise` — флаг promiseCumEat до финала
- **Инструкция:** Обещание на финал: съесть кончу
- **preferKeys:** cum
- **moods:** horny, cruel, chaotic, bored
- **Ответы:**
  - **Да** (`yes`) → `dare_accept` — +1 mood; дальше по taskType (timed_report / cage_hijack / cum_eat_promise / edge_ad / dice_chaos)
  - **Нет** (`no`) → `dare_refuse` — −1 mood; в harsh mood → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `dare_base_squeeze`

- **Вид:** dare
- **Вопрос (RU):** Смелость: сжать у основания члена ~18 секунд. Берёшься?
- **Speak EN:** Pinch the base. Count to eighteen in your head. No racing the tip.
- **taskType:** `timed_report` — таймер → кнопки Успел / Провалил
- **taskSec:** 18
- **Инструкция:** Сжимай у основания. Не гони головку
- **moods:** sweet, calm, horny
- **Ответы:**
  - **Да** (`yes`) → `dare_accept` — +1 mood; дальше по taskType (timed_report / cage_hijack / cum_eat_promise / edge_ad / dice_chaos)
  - **Нет** (`no`) → `dare_refuse` — −1 mood; в harsh mood → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `dare_edge_ad`

- **Вид:** dare
- **Вопрос (RU):** Смелость: несколько эджей подряд (edge-ad) прямо сейчас. Берёшься?
- **Speak EN:** Edge ad for me — several edges in a row, tiny rests only. Ready to suffer?
- **taskType:** `edge_ad` — вставить серию edge в очередь
- **Инструкция:** Серия эджей с короткими паузами
- **moods:** cruel, chaotic, bored, horny
- **Ответы:**
  - **Да** (`yes`) → `dare_accept` — +1 mood; дальше по taskType (timed_report / cage_hijack / cum_eat_promise / edge_ad / dice_chaos)
  - **Нет** (`no`) → `dare_refuse` — −1 mood; в harsh mood → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `dare_dice_chaos`

- **Вид:** dare
- **Вопрос (RU):** Смелость: бросить «кости хаоса» — случайно ломаем план сессии. Берёшься?
- **Speak EN:** Roll my dice. Whatever lands — you obey. Ready?
- **taskType:** `dice_chaos` — случайная мутация сессии
- **Инструкция:** Случайный исход: edge-ad / rest / denial / …
- **moods:** chaotic, cruel, bored, horny
- **Ответы:**
  - **Да** (`yes`) → `dare_accept` — +1 mood; дальше по taskType (timed_report / cage_hijack / cum_eat_promise / edge_ad / dice_chaos)
  - **Нет** (`no`) → `dare_refuse` — −1 mood; в harsh mood → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `dare_say_hutao`

- **Вид:** dare
- **Вопрос (RU):** Смелость: скажи вслух «Ху Тао» 10 раз за ~15 секунд. Берёшься?
- **Speak EN:** Say my name — Hu Tao — ten times before the timer dies. No whispering.
- **taskType:** `timed_report` — таймер → кнопки Успел / Провалил
- **taskSec:** 15
- **taskCount:** 10
- **Инструкция:** Вслух: «Ху Тао» ×10 до конца таймера
- **preferKeys:** hu_tao, character
- **moods:** sweet, horny, chaotic, cruel
- **Ответы:**
  - **Да** (`yes`) → `dare_accept` — +1 mood; дальше по taskType (timed_report / cage_hijack / cum_eat_promise / edge_ad / dice_chaos)
  - **Нет** (`no`) → `dare_refuse` — −1 mood; в harsh mood → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `dare_thank_hutao`

- **Вид:** dare
- **Вопрос (RU):** Смелость: вслух поблагодари Ху Тао за то, что она тобой командует. Берёшься?
- **Speak EN:** Thank your gamer girl out loud. Soft voice. Mean gratitude.
- **taskType:** `timed_report` — таймер → кнопки Успел / Провалил
- **taskSec:** 12
- **Инструкция:** Скажи вслух спасибо Ху Тао до конца таймера
- **preferKeys:** hu_tao, humiliation, gamer
- **moods:** cruel, chaotic, horny, sweet
- **Ответы:**
  - **Да** (`yes`) → `dare_accept` — +1 mood; дальше по taskType (timed_report / cage_hijack / cum_eat_promise / edge_ad / dice_chaos)
  - **Нет** (`no`) → `dare_refuse` — −1 mood; в harsh mood → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `dare_stare_no_touch`

- **Вид:** dare
- **Вопрос (RU):** Смелость: руки за спину, смотри на экран ~20 секунд. Берёшься?
- **Speak EN:** Hands behind your back. Eyes on me. Twenty seconds of hungry nothing.
- **taskType:** `timed_report` — таймер → кнопки Успел / Провалил
- **taskSec:** 20
- **Инструкция:** Руки за спиной. Смотри на экран. Не трогай себя
- **preferKeys:** hu_tao, denial
- **moods:** cruel, calm, bored, horny
- **Ответы:**
  - **Да** (`yes`) → `dare_accept` — +1 mood; дальше по taskType (timed_report / cage_hijack / cum_eat_promise / edge_ad / dice_chaos)
  - **Нет** (`no`) → `dare_refuse` — −1 mood; в harsh mood → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `dare_slow_count`

- **Вид:** dare
- **Вопрос (RU):** Смелость: дрочи медленно и считай вслух до 25. Берёшься?
- **Speak EN:** Slow strokes only — count to twenty-five out loud. Miss a number = shame.
- **taskType:** `timed_report` — таймер → кнопки Успел / Провалил
- **taskSec:** 25
- **Инструкция:** Медленные ходы. Считай вслух 1…25
- **moods:** sweet, calm, horny
- **Ответы:**
  - **Да** (`yes`) → `dare_accept` — +1 mood; дальше по taskType (timed_report / cage_hijack / cum_eat_promise / edge_ad / dice_chaos)
  - **Нет** (`no`) → `dare_refuse` — −1 mood; в harsh mood → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `dare_edge_whisper`

- **Вид:** dare
- **Вопрос (RU):** Смелость: на грани шепчи «please» ~18 секунд. Берёшься?
- **Speak EN:** Ride the edge. Whisper 'please' every breath. Eighteen seconds.
- **taskType:** `timed_report` — таймер → кнопки Успел / Провалил
- **taskSec:** 18
- **Инструкция:** Держи грань. Шепчи please. Не кончай
- **preferKeys:** denial
- **moods:** horny, cruel, chaotic
- **Ответы:**
  - **Да** (`yes`) → `dare_accept` — +1 mood; дальше по taskType (timed_report / cage_hijack / cum_eat_promise / edge_ad / dice_chaos)
  - **Нет** (`no`) → `dare_refuse` — −1 mood; в harsh mood → rest 15с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

---

## equip (6)

### `equip_plug`

- **Вид:** equip
- **Вопрос (RU):** Засунь пробку в попку и оставь. Когда сделаешь — жми «Да».
- **Speak EN:** Put the plug in your ass for me. Leave it there.
- **preferKeys:** anal
- **toyId:** plug
- **Ответы:**
  - **Да** (`yes`) → `equip_yes` — +1 mood; надеть toyId и пересобрать хвост сессии
  - **Нет** (`no`) → `equip_no` — −1 mood; в harsh mood → rest 12с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `equip_vibe_plug`

- **Вид:** equip
- **Вопрос (RU):** Вставь вибро-пробку. Когда сделаешь — жми «Да».
- **Speak EN:** Swap to the vibrating plug. In. On. Stay filled.
- **preferKeys:** anal
- **toyId:** vibrating_plug
- **Ответы:**
  - **Да** (`yes`) → `equip_yes` — +1 mood; надеть toyId и пересобрать хвост сессии
  - **Нет** (`no`) → `equip_no` — −1 mood; в harsh mood → rest 12с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `equip_edge2`

- **Вид:** equip
- **Вопрос (RU):** Вставь Edge 2 (вместо пробки). Когда сделаешь — жми «Да».
- **Speak EN:** Take out whatever's in your ass — Edge 2 goes in. Now.
- **preferKeys:** anal
- **toyId:** lovense_edge2
- **Ответы:**
  - **Да** (`yes`) → `equip_yes` — +1 mood; надеть toyId и пересобрать хвост сессии
  - **Нет** (`no`) → `equip_no` — −1 mood; в harsh mood → rest 12с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `equip_wand`

- **Вид:** equip
- **Вопрос (RU):** Возьми wand в руку. Когда готов — жми «Да».
- **Speak EN:** Pick up the wand. You'll keep it for the next stretch.
- **toyId:** wand
- **Ответы:**
  - **Да** (`yes`) → `equip_yes` — +1 mood; надеть toyId и пересобрать хвост сессии
  - **Нет** (`no`) → `equip_no` — −1 mood; в harsh mood → rest 12с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `equip_cage`

- **Вид:** equip
- **Вопрос (RU):** Надень клетку. Когда надел — жми «Да».
- **Speak EN:** Cage on. Lock it. Soft cock stays mine.
- **preferKeys:** denial, cbt
- **toyId:** chastity_cage
- **Ответы:**
  - **Да** (`yes`) → `equip_yes` — +1 mood; надеть toyId и пересобрать хвост сессии
  - **Нет** (`no`) → `equip_no` — −1 mood; в harsh mood → rest 12с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `equip_dildo_s`

- **Вид:** equip
- **Вопрос (RU):** Возьми / вставь маленькое дилдо. Когда готово — жми «Да».
- **Speak EN:** Small dildo in. You'll thrust when I say — leave it ready.
- **preferKeys:** anal
- **toyId:** dildo_small
- **Ответы:**
  - **Да** (`yes`) → `equip_yes` — +1 mood; надеть toyId и пересобрать хвост сессии
  - **Нет** (`no`) → `equip_no` — −1 mood; в harsh mood → rest 12с
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

---

## moodOffer (6)

### `offer_meaner_sweet`

- **Вид:** mood_offer
- **Вопрос (RU):** Хочешь, чтобы я стала злее и жёстче (меньше «милости»)?
- **Speak EN:** Want me to get meaner? I can drop the soft act.
- **moods:** sweet, calm
- **Ответы:**
  - **Да** (`yes`) → `mood_harsher` — жёстче params + rebuild; ~55% edge-ad; mood −2
  - **Нет** (`no`) → `mood_refuse` — отказ от смены mood; mood 0
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `offer_harsher_horny`

- **Вид:** mood_offer
- **Вопрос (RU):** Хочешь, чтобы я вела жёстче — меньше дразнилок, больше приказов?
- **Speak EN:** Want me harsher — less teasing, more orders?
- **moods:** horny, bored
- **Ответы:**
  - **Да** (`yes`) → `mood_harsher` — жёстче params + rebuild; ~55% edge-ad; mood −2
  - **Нет** (`no`) → `mood_refuse` — отказ от смены mood; mood 0
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `offer_softer_cruel`

- **Вид:** mood_offer
- **Вопрос (RU):** Хочешь, чтобы я стала добрее и мягче до конца сессии?
- **Speak EN:** Beg for soft. Or stay under my mean mood — your choice.
- **moods:** cruel, chaotic, bored
- **Ответы:**
  - **Да** (`yes`) → `mood_softer` — мягче params + rebuild; mood +2
  - **Нет** (`no`) → `mood_refuse` — отказ от смены mood; mood 0
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `offer_even_meaner`

- **Вид:** mood_offer
- **Вопрос (RU):** Хочешь ещё злее / хаотичнее, чем сейчас?
- **Speak EN:** Still not mean enough? Want me worse — chaotic mean?
- **moods:** cruel, bored
- **Ответы:**
  - **Да** (`yes`) → `mood_harsher` — жёстче params + rebuild; ~55% edge-ad; mood −2
  - **Нет** (`no`) → `mood_refuse` — отказ от смены mood; mood 0
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `offer_horny_up`

- **Вид:** mood_offer
- **Вопрос (RU):** Хочешь, чтобы я стала похотливее и грязнее вместо «милой»?
- **Speak EN:** Want me hungrier — more needy and filthy instead of sweet?
- **moods:** sweet, calm
- **Ответы:**
  - **Да** (`yes`) → `mood_horny` — horny params + rebuild; moodScore → 1
  - **Нет** (`no`) → `mood_refuse` — отказ от смены mood; mood 0
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

### `offer_deny_more`

- **Вид:** mood_offer
- **Вопрос (RU):** Хочешь меньше жалости дальше: больше эджей, меньше пощады?
- **Speak EN:** Want the rest of the session meaner — more edges, less mercy?
- **moods:** horny, cruel, chaotic
- **Ответы:**
  - **Да** (`yes`) → `mood_harsher` — жёстче params + rebuild; ~55% edge-ad; mood −2
  - **Нет** (`no`) → `mood_refuse` — отказ от смены mood; mood 0
  - **Не отвечу** (`mute`) → `mute` — молчание (−2 mood); фраза mute

---

## permission (2)

### `perm_beg_release`

- **Вид:** permission
- **Вопрос (RU):** Хочешь умолять меня о разрешении кончить — или сразу отказ?
- **Speak EN:** Beg properly. Do you want permission to cum later?
- **moods:** sweet, horny, calm, bored
- **Ответы:**
  - **Умоляю…** (`please`) → `beg_please` — +1 mood; soften finale params; −1 beg credit
  - **Не буду умолять** (`skip`) → `beg_skip` — −1 mood; −1 beg credit
  - **Хочу отказ (denial)** (`deny`) → `beg_deny_want` — −1 mood; deny-lean params + denial quest; −1 beg credit

### `perm_beg_mean`

- **Вид:** permission
- **Вопрос (RU):** Встань на колени в голове: умолять… или честно хочешь denial?
- **Speak EN:** On your knees in your head. Beg — or admit you want denial.
- **moods:** cruel, chaotic, bored
- **Ответы:**
  - **Пожалуйста…** (`please`) → `beg_please` — +1 mood; soften finale params; −1 beg credit
  - **Промолчу** (`skip`) → `beg_skip` — −1 mood; −1 beg credit
  - **Хочу denial** (`deny`) → `beg_deny_want` — −1 mood; deny-lean params + denial quest; −1 beg credit

---

## finaleBias (2)

### `finale_bias_cum`

- **Вид:** finale_bias
- **Вопрос (RU):** Хочешь, чтобы финал чаще вёл к полноценному оргазму?
- **Speak EN:** Want the finale stacked toward a full orgasm?
- **moods:** sweet, horny, calm
- **Ответы:**
  - **Да, хочу кончить** (`yes`) → `finale_want_cum` — +1 mood; bias params к кончу
  - **Нет, хочу denial** (`deny`) → `finale_want_deny` — −1 mood; bias к deny + denial quest
  - **Лучше руин** (`ruin`) → `finale_want_ruin` — 0 mood; bias к ruin

### `finale_bias_deny`

- **Вид:** finale_bias
- **Вопрос (RU):** Честно про финал: кончить, руин или полный отказ?
- **Speak EN:** Be honest — cum, ruin, or full denial for the finale?
- **moods:** cruel, chaotic, bored, horny
- **Ответы:**
  - **Кончить** (`cum`) → `finale_want_cum` — +1 mood; bias params к кончу
  - **Руин** (`ruin`) → `finale_want_ruin` — 0 mood; bias к ruin
  - **Denial / отказ** (`deny`) → `finale_want_deny` — −1 mood; bias к deny + denial quest

---

