#pragma once

#include "actuator_set.h"

constexpr int LEFT_IN1 = 25;
constexpr int LEFT_IN2 = 26;
constexpr int RIGHT_IN1 = 27;
constexpr int RIGHT_IN2 = 33;

void motorsBegin();
void motorsApply(Pwm left, Pwm right);
