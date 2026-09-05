#include "leds.h"

#include <Arduino.h>

void ledsBegin() {
    pinMode(LED_LEFT, OUTPUT);
    pinMode(LED_RIGHT, OUTPUT);
    ledsOff();
}

void ledsOff() {
    digitalWrite(LED_LEFT, LOW);
    digitalWrite(LED_RIGHT, LOW);
}

void ledsBoth() {
    digitalWrite(LED_LEFT, HIGH);
    digitalWrite(LED_RIGHT, HIGH);
}

void ledsLeft() {
    digitalWrite(LED_LEFT, HIGH);
    digitalWrite(LED_RIGHT, LOW);
}

void ledsRight() {
    digitalWrite(LED_LEFT, LOW);
    digitalWrite(LED_RIGHT, HIGH);
}
