# События — журнал памяти
Один JSON на главу, путь events/NNNNNN.json. schema=1, chapter=номер, events=[...]. У каждого события уникальный id (event.000001.001), tick (целое >= предыдущего), scene (ID сцены из каталога), type, data. Сцены упорядочены, у каждой свой POV, место и участники; все ссылки — стабильные ID. Данные событий:
- create_character/create_place/create_item: record (полное досье/запись с ID и именем).
- change_state: character, field (location,health,emotion,alive,items,goals), before, after.
- change_profile: character, field (существующее поле досье кроме id/name/state), before, after.
- relationship: from,to,before,after. before=null при первом появлении. after объект с trust,respect,affection,conflict (целые 0..100, только художественная шкала), bond,address,reason,memories,promises. Обратная связь отдельным событием. Каждая имеет источник сцены.
- fact: record с id,text,certainty (established/rumor/belief), category, subjects (ID героев/мест/вещей). Для объективного факта established; слух не истина.
- knowledge: character,fact,before,after. after содержит mode (witnessed/told/inferred/mistaken/forgotten), source (ID героя или null), note. told требует, чтобы источник уже знал факт; witnessed требует присутствия. Персонаж не получает все факты читателя.
- open_thread: record с id,title,status="open",question,stakes,participants. close_thread: thread, resolution. Не закрывать арку вне сцены.
- transfer_item: item,from,to (ID героя или null). Проверяется единственный владелец.
- note: text — событие, не меняющее состояние.
Любой значимый переход должен присутствовать в тексте; нельзя писать событие ради формального прохождения CI. Порядок событий внутри главы имеет значение. Если публикация включает исправление канона, записать причину и авторское разрешение в отдельном PR, а не менять прошлую запись. 
