#pragma once

// Left  gearbox: HW-095 OUT1 / OUT2
// Right gearbox: HW-095 OUT3 / OUT4
constexpr int LEFT_IN1 = 25;
constexpr int LEFT_IN2 = 26;
constexpr int RIGHT_IN1 = 27;
constexpr int RIGHT_IN2 = 33;

void motorsBegin();
void motorsStop();
void motorsForward();
void motorsBackward();
void motorsRotateLeft();
void motorsRotateRight();
