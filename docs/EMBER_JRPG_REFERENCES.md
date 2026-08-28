# Ember JRPG — исследование референсов

Дата проверки: 28 августа 2026 года.

Цель файла — сохранить проверенные ссылки и проектные выводы, а не копии чужих материалов. Сторонние изображения, тексты и PDF не зеркалируются в репозитории: это уменьшает риск устаревания и нарушения прав. Названия игр и товарные знаки принадлежат их владельцам.

## Метод

За основу структуры GDD взяты рекомендации Unity Learn: сначала фиксировать цель игрока, правила, препятствия, feedback и core loop, затем приоритизировать функции и проверять их пользовательскими тестами.

- [Unity Learn — Game Design](https://learn.unity.com/tutorial/game-design?version=6.3)
- [Unity Learn — Create a game design document](https://learn.unity.com/tutorial/664b276cedbc2a4d7b2e4f10?version=2022.3)

Unity прямо отмечает, что единого обязательного формата GDD нет. Поэтому основной документ Ember сделан как живой brief: принятые решения, проверяемые гипотезы, non-goals, вертикальный срез и список вопросов.

## The Legend of Zelda

### Источники

- [Nintendo — интервью о создании первой The Legend of Zelda](https://www.nintendo.com/en-gb/News/2016/November/Nintendo-Classic-Mini-NES-special-interview-Volume-4-The-Legend-of-Zelda-1160048.html)
- [Nintendo — The Legend of Zelda: Link's Awakening](https://www.nintendo.com/en-gb/Games/Nintendo-Switch-games/The-Legend-of-Zelda-Link-s-Awakening-1514327.html)
- [Nintendo — Eiji Aonuma о Chamber Dungeons](https://zelda.nintendo.com/links-awakening/blog/chamber-dungeons-with-eiji-aonuma/)
- [Nintendo — разработчики Link's Awakening о мире-диораме](https://zelda.nintendo.com/links-awakening/blog/director-yoshiki-haruhana/)

### Наблюдения

- Первая Zelda задумывалась как приключение и поиск сокровищ; карта и обмен открытиями между игроками были частью ощущения тайны.
- Link's Awakening связывает компактный остров, ярких жителей, распределённые по миру подземелья, предметные препятствия и секреты.
- Официальное описание подземелий подчёркивает навигацию room-by-room, загадки, ловушки и бои.
- Chamber Dungeons показывают полезную производственную абстракцию: комната может быть самостоятельным модулем с понятными соединениями и обязательными функциями.
- Визуал ремейка проектировался как миниатюрная диорама: богатая деталь ограничивается масштабом персонажа и не должна превращаться в шум.

### Вывод для Ember

Использовать Zelda как референс грамматики зон, ориентиров, секретов, предметных/стихийных препятствий и комнат подземелья. Не переносить action combat и конкретную прогрессию предметов.

## Trails / The Legend of Heroes

### Источники

- [Falcom — свободные дни и bonding events в Trails of Cold Steel](https://www.falcom.co.jp/sen/system/system06.html)
- [Falcom — AT battle и видимая очередь](https://www.falcom.co.jp/sen/battle/battle01.html)
- [Falcom — Tactical Link и развитие совместных действий](https://www.falcom.co.jp/sen/battle/battle02.html)
- [Falcom — обновлённая AT-система Trails of Cold Steel III](https://www.falcom.co.jp/sen3/system/)

### Наблюдения

- Личные события встроены в дни свободного исследования, меняются вместе со временем суток и помечаются на общей карте.
- Ограниченные bonding points создают выбор, но также делают часть характеров пропускаемой; Ember не обязан наследовать этот недостаток.
- Видимая AT-очередь превращает порядок ходов в отдельный объект тактики; бонус очереди способен достаться и врагу.
- Tactical Link соединяет характеры и бой: совместные атаки, прикрытие и способности пары развиваются вместе с её связью.

### Вывод для Ember

Использовать Trails как референс ритма глав, жизни знакомых NPC, личных сцен спутников, видимой очереди и характерных duo-действий. Отношения не должны зависеть только от скрытых очков или создавать обязательный damage multiplier.

## Octopath Traveler

### Источники

- [Square Enix — материал об эстетике HD-2D](https://www.jp.square-enix.com/column/detail/58/)
- [Square Enix — Octopath Traveler II: system](https://www.jp.square-enix.com/octopathtraveler2/system/)
- [Square Enix — Octopath Traveler 0: Break & Boost](https://www.jp.square-enix.com/octopathtraveler0/system/)
- [Square Enix — программа о создании и развитии HD-2D](https://www.jp.square-enix.com/presents/info/20230302003533.html)

### Наблюдения

- Square Enix определяет HD-2D как соединение pixel graphics и 3D CG/эффектов: ностальгическая форма получает объём, свет и атмосферу современной сцены.
- В Octopath Traveler II взаимодействие с миром меняется между днём и ночью; истории героев пересекаются, а исследование поддерживается разными способностями.
- Break создаёт читаемое окно уязвимости, Boost — осознанное решение потратить накапливаемый ресурс на усиление атаки, лечения или поддержки.

### Вывод для Ember

Использовать визуальный контраст «пиксельный герой + объёмное окружение» и принцип ясного изменения темпа боя. Не копировать точный post-processing, восемь сюжетов и Break/Boost.

## ALLfiring

### Источники

- [ALLfiring — официальный сайт](https://allfiring.genmugame.com/)
- [Google Play — официальное описание от GENMUGAME](https://play.google.com/store/apps/details?hl=en-US&id=com.genmugame.prometheus)

### Наблюдения

Официальное описание выделяет voxel sandbox maps, многослойные маршруты, скрытые пути, сокровища, environmental puzzles, взаимодействие с объектами и самостоятельные истории спутников. Одновременно игра является side-scrolling action RPG с realtime-сменой трёх персонажей.

### Вывод для Ember

Визуальным ориентиром является плотность и приключенческая выразительность воксельных областей, а не жанр, управление, монетизация или боевая система ALLfiring.

## Lost Castle 2

### Источники

- [Hunter Studio — Lost Castle 2 в Steam](https://store.steampowered.com/app/2445690/Lost_Castle_2/)

### Наблюдения

Официальная страница показывает цветной 2D beat'em up/roguelite с большим количеством выразительных персонажей, существ, оружия и отличающихся сцен — Black Forest, Abandoned Village, Crystal Mountain и Black Castle.

### Вывод для Ember

Это moodboard для рисованных портретов, крупных сцен, декоративных фонов, эмоций и силуэтов. Roguelite, beat'em up и loot-volume не являются ориентирами.

## Magicka

### Источники

- [Paradox Interactive — Magicka](https://www.paradoxinteractive.com/games/magicka/about)
- [Paradox Interactive — Magicka 2](https://www.paradoxinteractive.com/games/magicka-2/about)

### Наблюдения

- Основная особенность — динамическое комбинирование элементов для создания заклинаний.
- Magicka 2 разрешает сочетать до пяти элементов и подчёркивает экспериментирование с большим числом результатов.
- Эти игры realtime, co-op и намеренно хаотичны; friendly fire является частью юмора.

### Вывод для Ember

Сохранить свободу причинно-следственных стихийных взаимодействий, но перевести её в читаемые пошаговые состояния с preview. Первый prototype ограничить четырьмя стихиями и несколькими authored-реакциями.

## Disgaea

### Источники

- [NIS America — Disgaea 7 Complete: Team Attacks и Lift & Throw](https://www.nisamerica.com/disgaea/d7-complete/system/combat/basic)
- [NIS America — Disgaea D2: Geo Effects](https://www.nisamerica.com/disgaea/dis_d2/system/geo_effect.html)
- [NIS America — Disgaea D2: grid, team attacks и позиционные бонусы](https://www.nisamerica.com/disgaea/dis_d2/system/basic.html)
- [NIS America — анонс Disgaea 5: отношения и Alliance Attacks](https://nisamerica.com/nart/pbombs/2014/507/D5_announcement_12162014pb.pdf)
- [NIS America — Disgaea 5 Complete: масштаб прогрессии и классов](https://www.nisamerica.com/disgaea/d5-complete/sp/system.html)
- [PlayStation Blog — Disgaea 7: Auto-Battle и Item Reincarnation](https://blog.playstation.com/?p=374797)

### Наблюдения

- Geo Symbols задают положительные или отрицательные эффекты всем юнитам на связанных цветных Geo Panels. Символ можно переместить или уничтожить, поэтому правило поля само становится объектом тактики.
- Team Attacks зависят от близости союзников; в Disgaea 5 отношения между героями также влияют на доступность Alliance Attacks.
- Lift & Throw позволяет быстро сократить дистанцию, отдалить врага или переместить объект правила. Более общий принцип — сильное, заранее читаемое изменение позиции.
- Высота, направление атаки и размещение превращают короткую карту в пространственную задачу.
- Серия сознательно строится вокруг крайностей: уровней до 9999, огромного урона, большого числа классов, повторного прохождения карт, Item World, реинкарнации и автобоя.

### Вывод для Ember

Проверить три идеи: 3–5 участков поля с общими стихийными правилами, relationship/position-based duo-действия и `push/pull/reposition` для юнитов и объектов. Один и тот же encounter сравнить в зональном и малом клеточном вариантах. Не переносить grind-структуру, числовую инфляцию и полную grid-SRPG до доказательства, что клеточное перемещение улучшает именно Ember.

## Что ещё можно исследовать позже

Эти направления не являются принятыми референсами и требуют отдельного запроса:

- игры с сюжетной романтикой после начала отношений, а не только до признания;
- пошаговые RPG с лёгким позиционированием без полной grid-tactics;
- игры, где одна система элементов одинаково работает в бою и environmental puzzles;
- production-подходы к pixel characters в 3D Godot без копирования HD-2D;
- доступность и скорость интерфейса длинных пошаговых кампаний.
