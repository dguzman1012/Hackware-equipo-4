#include "motors.h"

#include <Arduino.h>

void motorsBegin() {
    pinMode(LEFT_IN1, OUTPUT);
    pinMode(LEFT_IN2, OUTPUT);
    pinMode(RIGHT_IN1, OUTPUT);
    pinMode(RIGHT_IN2, OUTPUT);
    motorsApply(0, 0);
}

static void wheel(int in1, int in2, Pwm v) {
    digitalWrite(in1, v > 0 ? HIGH : LOW);
    digitalWrite(in2, v < 0 ? HIGH : LOW);
}

void motorsApply(Pwm left, Pwm right) {
    wheel(LEFT_IN1, LEFT_IN2, left);
    wheel(RIGHT_IN1, RIGHT_IN2, right);
}
