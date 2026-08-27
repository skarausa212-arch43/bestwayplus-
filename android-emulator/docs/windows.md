# Запуск на Windows

## Установка

```powershell
# распаковать архив, затем из каталога проекта:
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
```

Нужен Node 20+. Go **не нужен**: в архиве лежат собранные `.exe` прокси для
x64 и ARM64 (`tools\tlsproxy\bin\`), нужный выбирается автоматически.

### Или из репозитория, без архива

Go **не нужен**: `.exe` прокси для Windows лежат прямо в ветке (это единственное
исключение из правила «бинарники в git не хранятся» — без них клон не был бы
рабочей установкой, а `winget` есть далеко не в каждой сборке Windows 10).

Команды выполняйте **по одной**. `npx` может спросить `Ok to proceed? (y)` —
на такой вопрос надо ответить `y` и нажать Enter, а не вставлять следующую
команду: она уйдёт как ответ и всё отменится.

```cmd
cd /d %USERPROFILE%
git clone -b claude/android-device-emulator-wmqczw https://github.com/skarausa212-arch43/bestwayplus-.git emulator
cd emulator\android-emulator
npm install
npx playwright install chromium
node bin\cli.js verify pixel-8-pro
```

Последний аргумент `emulator` в `git clone` — имя новой папки. Он нужен, если
`bestwayplus-` у вас уже есть: без него git откажется писать в непустой каталог.

## Запуск: AndroidEmulator.exe

Двойной клик по `AndroidEmulator.exe` в корне папки. Он сам поднимает сервер и
открывает отдельное окно приложения — без адресной строки, вкладок и консоли.
Закрыли окно — всё остановилось, включая запущенные устройства.

Внутри это не второй Chromium: `.exe` находит уже установленный браузер
(сначала тот, что скачал Playwright, затем Chrome или Edge) и открывает его в
режиме `--app`. Поэтому он весит 6 МБ, а не 150.

Если что-то пойдёт не так, вы увидите окно с описанием, а подробности лягут в
`panel.log` рядом с exe. Консоли нет, поэтому ошибка приходит именно так.

Тот же интерфейс из командной строки, если удобнее:

```cmd
cd /d %USERPROFILE%\emulator\android-emulator
```
```cmd
node bin\cli.js gui
```

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
npm run build:proxy
```

Соберёт под вашу архитектуру и положит туда, где резолвер его ищет. Вручную
это `go build -o bin\tlsproxy-win32-x64.exe .` из `tools\tlsproxy` — обратите
внимание на `.exe`: без расширения Windows файл не запустит, а `go build -o
tlsproxy` его не добавляет.

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
