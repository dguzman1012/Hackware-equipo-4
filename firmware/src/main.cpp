#include <Arduino.h>

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "cp src/secrets.example.h src/secrets.h"
#endif

#include "failsafe.h"
#include "led_view.h"
#include "leds.h"
#include "link.h"
#include "motors.h"
#include "say_gate.h"
#include "sensors.h"
#include "servos.h"
#include "tone_out.h"
#include "voice.h"

static Link g_link;
static SayGate g_say;
static LinkPhase g_shown = LinkPhase::Offline;

void setup() {
    Serial.begin(115200);
    delay(200);
    Serial.println("[link] boot");
    motorsBegin();
    servosBegin();
    toneBegin();
    voiceBegin();
    ledsBegin();
    sensorsBegin();
    g_link.begin(Secrets{WIFI_SSID, WIFI_PASS, SERVER_IP_OR_NULL});
}

void loop() {
    const uint32_t now = millis();
    const SensorFrame sensors = sensorsRead();
    const LinkView link = g_link.tick(now, sensors);
    const Actuation act = effective(link, sensors.distCm);

    motorsApply(act.left, act.right);
    servosApply(act.deg1, act.deg2);
    toneApply(act.tone);
    const ClipId say = g_say.step(link, now);
    if (say != ClipId::None) {
        Serial.printf("[voice] say=%u\n", static_cast<unsigned>(say));
    }
    voiceStep(say);
    ledsShow(ledFrame(link.phase, act, link.lastSeq), now);

    static bool first = true;
    if (first || link.phase != g_shown) {
        first = false;
        g_shown = link.phase;
        Serial.printf("[link] %s\n", phaseName(link.phase));
    }
}
