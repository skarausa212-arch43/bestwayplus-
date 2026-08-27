# Запуск на Windows

## Установка

```powershell
# распаковать архив, затем из каталога проекта:
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
```

Нужен Node 20+. Go **не нужен**: в архиве лежат собранные `.exe` прокси для
x64 и ARM64 (`tools\tlsproxy\bin\`), нужный выбирается автоматически.

## Три ошибки, на которые натыкаются первыми

**«Cannot find module ...\tools\fetch-fonts.mjs».** Команды запускаются из
каталога распакованного проекта, а не из домашней папки. Сначала `cd` туда:

```powershell
cd C:\Users\<вы>\android-emulator-windows
node tools\fetch-fonts.mjs .\android-fonts
```

**«"andro" не является внутренней или внешней командой».** Короткого имени
`andro` в системе нет — оно появляется только после `npm link`. Пока его не
сделали, вызывайте CLI напрямую:

```powershell
node bin\cli.js verify pixel-8-pro
node bin\cli.js open  galaxy-s23-ultra https://example.com --upstream socks5://user:pass@host:1080
```

Хотите короткое имя — один раз выполните `npm link` в каталоге проекта.

**Заблокированный `.exe`.** Файлы, скачанные через браузер, помечаются Mark of
the Web, и неподписанный `.exe` может не запуститься. `install-windows.ps1`
снимает пометку сам; вручную это:

```powershell
Get-ChildItem tools\tlsproxy\bin\* | Unblock-File
```

Если запускать чужие бинарники не хочется — соберите свои, исходники в архиве:

```powershell
cd tools\tlsproxy
go build -o bin\tlsproxy-win32-x64.exe .
```

Хеши того, что собрано в архиве, лежат в `VERSION`.

## Чего на Windows нет: ограничение набора шрифтов

То же ограничение, что и на macOS, по той же причине. Слой шрифтов работает
через fontconfig, а **Chromium читает fontconfig только на Linux**: на Windows
он идёт через DirectWrite, и способа скрыть системные шрифты от одного процесса
DirectWrite не даёт. Поэтому:

- `--fonts` на Windows **принимается, но не действует**. В консоль уходит
  `font restriction inactive: ...`, а `verify` понижает соответствующие
  проверки до предупреждений вместо ошибок. Молчаливое «сработало» было бы
  хуже всего: вы бы считали проверку закрытой.
- Определение шрифтов через **canvas-метрики** закрыто полностью — это уровень
  скрипта.
- Открытым остаётся определение через **DOM-раскладку**. Сайт, который так
  проверяет, увидит шрифты вашей Windows — Segoe UI, Calibri, Tahoma — которых
  на Android нет. Для эмуляции Android это заметное расхождение: набор шрифтов
  Windows не спутать с телефонным.

Если этот слой важен — нужен Linux. Достаточно контейнера или WSL2:

```bash
# в WSL2 (Ubuntu)
sudo apt-get update && sudo apt-get install -y fontconfig
npm install && npx playwright install --with-deps chromium
node tools/fetch-fonts.mjs ./android-fonts
node bin/cli.js verify pixel-8-pro --fonts ./android-fonts
```

Там та же команда даёт 70/71 с полностью закрытым DOM-детектом шрифтов.

## Прочие мелочи

**Путь к профилям.** По умолчанию `.\profiles-data\<device>-<seedId>\`. Внутри
лежат cookies, localStorage и локальный CA; каталог переживает перезапуск.

**Антивирус.** Прокси поднимает локальный MITM с самоподписанным CA и слушает
порт на `127.0.0.1`. Некоторые антивирусы реагируют на это. CA генерируется
локально, в системное хранилище не ставится и живёт только в каталоге профиля —
браузеру он передаётся точечно, через `--ignore-certificate-errors-spki-list`
с хешем именно этого ключа.

**DNS.** Бинарники собраны с `CGO_ENABLED=0`, то есть используют резолвер на
чистом Go. Имена резолвятся по маршруту прокси, а не по настройкам системы.
