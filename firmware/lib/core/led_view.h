#pragma once

#include <cstdint>

#include "failsafe.h"
#include "link_core.h"

struct LedPattern {
    uint16_t periodMs;
    uint16_t onMs;
    uint16_t offsetMs;
};

constexpr LedPattern LED_OFF{1, 0, 0};
constexpr LedPattern LED_ON{1, 1, 0};
constexpr LedPattern LED_SLOW{1000, 500, 0};
constexpr LedPattern LED_SWEEP_L{500, 250, 0};
constexpr LedPattern LED_SWEEP_R{500, 250, 250};
constexpr LedPattern LED_PULSE{1000, 50, 0};
constexpr LedPattern LED_MOTION{250, 125, 0};

struct LedFrame {
    LedPattern left;
    LedPattern right;
};

LedFrame ledFrame(LinkPhase phase, const Actuation& act, Seq lastSeq);

constexpr bool lit(LedPattern p, uint32_t now) {
    return p.onMs != 0 && ((now + p.offsetMs) % p.periodMs) < p.onMs;
}
