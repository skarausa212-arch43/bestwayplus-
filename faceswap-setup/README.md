# Faceswap — локальная установка

Развёртывание [deepfakes/faceswap](https://github.com/deepfakes/faceswap) — инструмента замены лиц на фото и видео (deep learning). Работает в три этапа: **extract** (извлечение лиц) → **train** (обучение модели) → **convert** (применение к целевому материалу).

## Требования

- Python **3.10+** (проверено на 3.11)
- git, ffmpeg (ffmpeg ставится автоматически pip-пакетом `ffmpeg-binaries`)
- ~4 ГБ диска под зависимости (PyTorch, Keras 3, OpenCV)
- GPU NVIDIA — желательно для обучения, но не обязательно: есть CPU-режим (медленнее в разы)

## Установка

```bash
./install-faceswap.sh          # автоопределение GPU
./install-faceswap.sh cpu      # только CPU
./install-faceswap.sh nvidia   # NVIDIA/CUDA
```

По умолчанию ставится в `~/faceswap` (меняется переменной `FACESWAP_DIR`). Скрипт клонирует репозиторий, создаёт venv и ставит зависимости из официальных requirements-файлов проекта.

Для AMD (ROCm) и Apple Silicon используйте соответствующие файлы из `faceswap/requirements/` вручную.

## Использование

```bash
cd ~/faceswap
source venv/bin/activate

# 1. Извлечь лица из исходников (человек A и человек B)
python faceswap.py extract -i ~/видео_A.mp4 -o ~/faces/A
python faceswap.py extract -i ~/видео_B.mp4 -o ~/faces/B

# 2. Обучить модель (часы на GPU, дни на CPU).
#    -t задаёт модель: lightweight, original, dfaker, villain, phaze_a и др.
python faceswap.py train -A ~/faces/A -B ~/faces/B -m ~/models/AB -t villain

# 3. Конвертировать целевое видео/фото
python faceswap.py convert -i ~/цель.mp4 -o ~/результат -m ~/models/AB
```

GUI (нужен графический дисплей): `python faceswap.py gui`

Список моделей и опций: `python faceswap.py train --help`
- **Phaze A** (`-t phaze_a`) — конструктор архитектур, самая гибкая, требует настройки в `config/train.ini`.
- **Villain** (`-t villain`) — тяжёлая модель высокой детализации, требует много VRAM (рекомендуется GPU от 8 ГБ).
- Для CPU/слабых GPU начните с `lightweight`.

## Этика использования

Проект faceswap распространяется с условиями: использовать только с материалами, на обработку которых у вас есть согласие изображённых людей; не создавать контент без согласия, порочащий или вводящий в заблуждение. См. [README проекта](https://github.com/deepfakes/faceswap#faceswap-has-ethical-uses).
