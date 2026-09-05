#pragma once

#include <cstdint>

using Seq = uint32_t;
using Pwm = int16_t;
using ServoDeg = uint8_t;

enum class Tone : uint8_t { Silent = 0, Beep = 1, Love = 2, Sad = 3, Party = 4 };

enum class ClipId : uint8_t {
    None = 0,
    FoundHere = 1,
    FoundGotYou = 2,
    FoundSawYou = 3,
    SeekWhere = 4,
    SeekComeOut = 5,
    SeekCantSee = 6,
};

constexpr uint8_t SAY_TOKEN_MAX = 63;

struct Utterance {
    uint8_t token;
    ClipId clip;
};

constexpr Utterance SAY_NONE{0, ClipId::None};

constexpr bool clipFromWire(int n, ClipId& out) {
    if (n < 0 || n > 6) return false;
    out = static_cast<ClipId>(n);
    return true;
}

struct ActuatorSet {
    Seq seq;
    Pwm left;
    Pwm right;
    ServoDeg deg1;
    ServoDeg deg2;
    Tone tone;
    Utterance say = SAY_NONE;
};

constexpr ActuatorSet SAFE_SET{0, 0, 0, 90, 90, Tone::Silent, SAY_NONE};
