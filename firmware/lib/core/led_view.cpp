#include "led_view.h"

static LedPattern wheel(Pwm v) {
    return v == 0 ? LED_ON : LED_MOTION;
}

static bool detectHold(Tone t) {
    switch (t) {
        case Tone::Love:
        case Tone::Party:
            return true;
        case Tone::Silent:
        case Tone::Beep:
        case Tone::Sad:
            return false;
    }
    return false;
}

LedFrame ledFrame(LinkPhase phase, const Actuation& act, Seq lastSeq) {
    switch (phase) {
        case LinkPhase::Offline:
            return {LED_SLOW, LED_SLOW};
        case LinkPhase::Searching:
            return {LED_SWEEP_L, LED_SWEEP_R};
        case LinkPhase::Lost:
            return {LED_PULSE, LED_PULSE};
        case LinkPhase::Linked:
            if (detectHold(act.tone)) {
                return {LED_ON, LED_ON};
            }
            if (act.left == 0 && act.right == 0) {
                const bool on = ((lastSeq / 5u) & 1u) != 0;
                return on ? LedFrame{LED_ON, LED_ON} : LedFrame{LED_OFF, LED_OFF};
            }
            return {wheel(act.left), wheel(act.right)};
    }
    return {LED_OFF, LED_OFF};
}
