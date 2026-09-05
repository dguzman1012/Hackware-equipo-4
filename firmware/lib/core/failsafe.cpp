#include "failsafe.h"

Actuation effective(const LinkView& link, std::optional<uint16_t> distCm) {
    switch (link.phase) {
        case LinkPhase::Offline:
            return SAFE_ACTUATION;
        case LinkPhase::Searching:
        case LinkPhase::Lost:
            return {0, 0, link.want.deg1, link.want.deg2, Tone::Silent};
        case LinkPhase::Linked: {
            Actuation a{link.want.left, link.want.right, link.want.deg1, link.want.deg2, link.want.tone};
            const bool forward = a.left > 0 && a.right > 0;
            if (distCm && *distCm < OBSTACLE_CM && forward) {
                a.left = 0;
                a.right = 0;
            }
            return a;
        }
    }
    return SAFE_ACTUATION;
}
