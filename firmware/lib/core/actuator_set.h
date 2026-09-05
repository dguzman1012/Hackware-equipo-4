#pragma once

#include <cstdint>

using Seq = uint32_t;
using Pwm = int16_t;
using ServoDeg = uint8_t;

enum class Tone : uint8_t { Silent = 0, Beep = 1, Love = 2, Sad = 3, Party = 4 };

struct ActuatorSet {
    Seq seq;
    Pwm left;
    Pwm right;
    ServoDeg deg1;
    ServoDeg deg2;
    Tone tone;
};

constexpr ActuatorSet SAFE_SET{0, 0, 0, 90, 90, Tone::Silent};
