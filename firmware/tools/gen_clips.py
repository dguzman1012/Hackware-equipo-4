#!/usr/bin/env python3

from __future__ import annotations

import struct
import subprocess
import tempfile
import wave
from pathlib import Path

RATE = 16000
COLS = 16
VOICE = "Monica"
SAY_RATE = "155"

CLIPS = (
    (1, "ahi_esta", "¡Ahí está Gauchito!"),
    (2, "te_encontre", "¡Te encontré, Gauchito!"),
    (3, "ya_te_vi", "¡Gauchito, ya te vi!"),
    (4, "donde_estas", "¿Dónde estás, Gauchito?"),
    (5, "sali_de_ahi", "Gauchito, salí de ahí"),
    (6, "no_te_veo", "No te veo, Gauchito"),
)

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "src"


def synth(text: str, wav_path: Path) -> None:
    aiff = wav_path.with_suffix(".aiff")
    subprocess.run(
        ["say", "-v", VOICE, "-r", SAY_RATE, "-o", str(aiff), text],
        check=True,
    )
    subprocess.run(
        ["afconvert", "-f", "WAVE", "-d", f"LEI16@{RATE}", str(aiff), str(wav_path)],
        check=True,
    )


def to_u8(wav_path: Path) -> list[int]:
    with wave.open(str(wav_path), "rb") as wav:
        if wav.getnchannels() != 1 or wav.getsampwidth() != 2:
            raise SystemExit(f"{wav_path}: expected mono 16-bit")
        raw = wav.readframes(wav.getnframes())
    samples = list(struct.unpack("<" + "h" * (len(raw) // 2), raw))
    peak = max((abs(x) for x in samples), default=1)
    gain = 120.0 / peak
    return [max(0, min(255, int(128 + x * gain))) for x in samples]


def write_header(idx: int, slug: str, samples: list[int]) -> Path:
    guard = f"CLIP_{idx}_{slug.upper()}_H"
    array = f"CLIP_{idx}_{slug.upper()}_PCM"
    length = f"CLIP_{idx}_{slug.upper()}_LEN"
    dest = OUT_DIR / f"clip_{idx}_{slug}.h"
    rows = []
    for i in range(0, len(samples), COLS):
        chunk = ", ".join(str(v) for v in samples[i : i + COLS])
        rows.append(f"    {chunk},")
    dest.write_text(
        "\n".join(
            [
                "#pragma once",
                "",
                "#include <Arduino.h>",
                "",
                f"constexpr int {length} = {len(samples)};",
                f"const uint8_t {array}[] PROGMEM = {{",
                *rows,
                "};",
                "",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    return dest


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        for idx, slug, text in CLIPS:
            wav = tmp_path / f"{idx}_{slug}.wav"
            synth(text, wav)
            samples = to_u8(wav)
            dest = write_header(idx, slug, samples)
            print(f"{dest.name} samples={len(samples)} dur={len(samples) / RATE:.2f}s")


if __name__ == "__main__":
    main()
