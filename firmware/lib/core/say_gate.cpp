#include "say_gate.h"

ClipId SayGate::step(const LinkView& link, uint32_t now) {
    if (link.phase != LinkPhase::Linked) return ClipId::None;

    const bool stale = !seeded_ || (now - lastFreshAt_) > SAY_STALE_MS;
    lastFreshAt_ = now;

    if (stale) {
        seeded_ = true;
        lastToken_ = link.want.say.token;
        return link.want.say.clip;
    }

    if (link.want.say.token != lastToken_) {
        lastToken_ = link.want.say.token;
        return link.want.say.clip;
    }
    return ClipId::None;
}
