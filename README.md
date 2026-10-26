# Reader

Быстрый просмотрщик и WYSIWYG-редактор Markdown для macOS.

Файл открывается сразу в красиво отрендеренном виде — сырой Markdown видеть не нужно: правки вносятся прямо в превью (notion-like редактор на Milkdown/Crepe).

## Возможности

- Открытие `.md`, `.markdown`, `.mdown`, `.mkd` и `.txt`
- WYSIWYG-редактирование: тулбар выделения, slash-команды, markdown round-trip
- Автосохранение (с индикатором несохранённых изменений в заголовке окна)
- Поиск по документу: `⌘F` — подсветка совпадений, счётчик, навигация next/prev, `Esc` — закрыть
- Открытие файла `⌘O`, папки `⌘⇧O`, а также drag&drop файла или папки в окно
- Сайдбар со списком файлов открытой папки (`⌘\` — свернуть/развернуть)
- Регистрация в системе как редактор Markdown-файлов по умолчанию

## Стек

- [Tauri 2](https://tauri.app) + WKWebView (нативная оболочка на Rust)
- [Milkdown Crepe](https://milkdown.dev) — WYSIWYG Markdown-редактор
- TypeScript, Vite, Vitest

## Сборка из исходников

Требуются: macOS, [Node.js](https://nodejs.org) (18+), [Rust](https://rustup.rs), Xcode Command Line Tools (`xcode-select --install`).

```sh
npm install
npm run tauri dev    # запуск в dev-режиме
npm run tauri build  # сборка приложения → src-tauri/target/release/bundle/
npm test             # unit-тесты
```

## Лицензия

[MIT](LICENSE)
