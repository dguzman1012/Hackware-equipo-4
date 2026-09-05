#pragma once

#include <optional>

#include "actuator_set.h"
#include "link_core.h"

constexpr uint16_t OBSTACLE_CM = 15;

struct Actuation {
    Pwm left;
    Pwm right;
    ServoDeg deg1;
    ServoDeg deg2;
    Tone tone;
};

constexpr Actuation SAFE_ACTUATION{0, 0, 90, 90, Tone::Silent};

Actuation effective(const LinkView& link, std::optional<uint16_t> distCm);
