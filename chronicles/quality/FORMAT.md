# Формат записи catalog.chapters
```json
{
 "number": 1, "volume":"vol.001", "title":"Название", "path":"books/vol-001/chapter-000001.md",
 "events":"events/000001.json", "sha256":"64 hex", "body_chars": 16000,
 "summary":"Краткий пересказ произошедшего, без будущих планов.",
 "participants":["char.tenmatsuyora"], "places":[], "themes":["долг"],
 "related_chapters":[],
 "scenes":[{"id":"scene.000001.001","pov":"char.tenmatsuyora","participants":["char.tenmatsuyora"],"place":null,"start_tick":1,"end_tick":3,"summary":"Что произошло"}],
 "review":{"canon":true,"voices":true,"knowledge":true,"relationships":true,"timeline":true,"style":true,"repetition":true,"notes":"Редактор прочитал предыдущую главу и проверил причинность."}
}
```
Пример схемы — не готовая глава. Ссылки на участников и места должны разрешаться к концу главы; ввод нового героя/места осуществляется событием в той же сцене. Число символов вычисляется как len(text.split("\n",1)[1].strip()). SHA256 по байтам. Для локального заполнения метаданных: python scripts/chronicle.py stamp. Для нового чата без терминала — вычислить SHA256 и длину через доступный инструмент либо предоставить проверенный текст и запустить скрипт локально; не подделывать значения. Не менять старые записи каталога. Обновить checkpoint: last_chapter, next_chapter, last_tick, summary, next_scene, open_threads. Проверка не гарантирует истинность редакторских отметок.
