#include "leds.h"

#include <Arduino.h>

void ledsBegin() {
    pinMode(LED_LEFT, OUTPUT);
    pinMode(LED_RIGHT, OUTPUT);
    digitalWrite(LED_LEFT, LOW);
    digitalWrite(LED_RIGHT, LOW);
}

void ledsShow(const LedFrame& f, uint32_t now) {
    digitalWrite(LED_LEFT, lit(f.left, now) ? HIGH : LOW);
    digitalWrite(LED_RIGHT, lit(f.right, now) ? HIGH : LOW);
}
