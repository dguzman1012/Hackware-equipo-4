#include "tone_out.h"

void toneBegin() {}

void toneApply(Tone t) {
    switch (t) {
        case Tone::Silent:
        case Tone::Beep:
        case Tone::Love:
        case Tone::Sad:
        case Tone::Party:
            break;
    }
}
