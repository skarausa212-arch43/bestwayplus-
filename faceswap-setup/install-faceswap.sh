#!/usr/bin/env bash
# Установка deepfakes/faceswap в локальное виртуальное окружение.
# Использование:
#   ./install-faceswap.sh            # автоопределение GPU (nvidia-smi)
#   ./install-faceswap.sh cpu        # принудительно CPU-версия
#   ./install-faceswap.sh nvidia     # принудительно NVIDIA/CUDA-версия
#   FACESWAP_DIR=~/apps/faceswap ./install-faceswap.sh   # свой каталог
set -euo pipefail

FACESWAP_DIR="${FACESWAP_DIR:-$HOME/faceswap}"
BACKEND="${1:-auto}"

if [[ "$BACKEND" == "auto" ]]; then
    if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
        BACKEND="nvidia"
    else
        BACKEND="cpu"
    fi
fi
echo "==> Бэкенд: $BACKEND"

PY=python3
if ! "$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then
    echo "Нужен Python 3.10+ (найден: $($PY --version))" >&2
    exit 1
fi

# tkinter — системный пакет, pip его не ставит; нужен даже для CLI (импортируется в lib/utils.py).
# Пакет python3-tk должен совпадать с минорной версией Python (например python3.12-tk для 3.12).
if ! "$PY" -c 'import tkinter' 2>/dev/null; then
    PYVER="$("$PY" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
    echo "==> Ставлю tkinter для Python $PYVER (нужны права sudo)"
    sudo apt-get install -y "python${PYVER}-tk" || sudo apt-get install -y python3-tk
    if ! "$PY" -c 'import tkinter' 2>/dev/null; then
        echo "tkinter так и не доступен для $PY. Установите python${PYVER}-tk" >&2
        echo "или используйте версию Python, для которой tkinter уже установлен." >&2
        exit 1
    fi
fi

if [[ ! -d "$FACESWAP_DIR/.git" ]]; then
    echo "==> Клонирую faceswap в $FACESWAP_DIR"
    git clone --depth 1 https://github.com/deepfakes/faceswap.git "$FACESWAP_DIR"
else
    echo "==> Репозиторий уже есть, обновляю"
    git -C "$FACESWAP_DIR" pull --ff-only
fi

cd "$FACESWAP_DIR"

if [[ ! -d venv ]]; then
    echo "==> Создаю виртуальное окружение"
    "$PY" -m venv venv
fi
./venv/bin/pip install --upgrade pip

echo "==> Устанавливаю зависимости (requirements_${BACKEND}.txt)"
./venv/bin/pip install -r "requirements/requirements_${BACKEND}.txt"

if [[ "$BACKEND" == "cpu" ]]; then
    # requirements_cpu.txt использует --extra-index-url, и pip может взять
    # CUDA-сборку torch с PyPI (~5 ГБ). Принудительно ставим CPU-сборку (~1.5 ГБ).
    if ./venv/bin/python -c 'import torch, sys; sys.exit(0 if "+cpu" in torch.__version__ else 1)' 2>/dev/null; then
        echo "==> torch уже CPU-сборки"
    else
        echo "==> Пробую заменить torch на компактную CPU-сборку"
        ./venv/bin/pip install --force-reinstall "torch>=2.3.0,<2.13.0" "torchvision>=0.18.0,<0.28.0" \
            --index-url https://download.pytorch.org/whl/cpu \
            || echo "==> download.pytorch.org недоступен — остаётся универсальная сборка с PyPI (больше по размеру, но работает и на CPU)"
    fi
fi

echo "==> Проверка"
./venv/bin/python faceswap.py --version || true
./venv/bin/python faceswap.py extract --help >/dev/null && echo "extract: OK"

cat <<EOF

Готово. Запуск:
  cd $FACESWAP_DIR
  ./venv/bin/python faceswap.py gui        # графический интерфейс (нужен дисплей)
  ./venv/bin/python faceswap.py extract -i <входное видео/фото> -o <папка лиц>
  ./venv/bin/python faceswap.py train -A <лица A> -B <лица B> -m <папка модели> -t villain
  ./venv/bin/python faceswap.py convert -i <вход> -o <выход> -m <папка модели>
EOF
