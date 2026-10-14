/*
  =============================================================================
  ME416 Lab 2: RASTICrane 3-DOF Robot Arm Controller Firmware
  =============================================================================
  Target Hardware: ESP32-S3, ESP32, Arduino Uno / Mega / Nano, Teensy
  
  Controls 3 PWM Servos:
    - Motor 1 (M1): Base Yaw     (Pin 18 on ESP32, or Pin 9 on Arduino)
    - Motor 2 (M2): Shoulder Elev(Pin 19 on ESP32, or Pin 10 on Arduino)
    - Motor 3 (M3): Elbow Elev   (Pin 20 on ESP32, or Pin 11 on Arduino)

  Pulse Widths (Standard RASTICrane PWM Specifications):
    - Neutral Home: 1.5 ms (1500 microseconds) for all motors
    - Working Range: 1300 us (-45 deg) to 1700 us (+45 deg)
    - PWM Frequency: 50 Hz (20 ms period)

  Serial Command Protocol (115200 baud, LF or CRLF terminator):
    - M1 <microseconds>       -> e.g. "M1 1500"
    - M2 <microseconds>       -> e.g. "M2 1500"
    - M3 <microseconds>       -> e.g. "M3 1500"
    - POS <m1> <m2> <m3>      -> e.g. "POS 1500 1480 1520"
    - HOME                    -> Sets M1, M2, M3 all to 1500 us (1.5ms)
    - STOP                    -> Detaches all servos (safe release / E-STOP)
    - PING                    -> Responds "PONG" with current pulse widths
  =============================================================================
*/

#if defined(ESP32) || defined(ARDUINO_ARCH_ESP32)
  #include <ESP32Servo.h>
  #define PIN_M1 18 // Base Yaw
  #define PIN_M2 19 // Shoulder
  #define PIN_M3 20 // Elbow
#else
  #include <Servo.h>
  #define PIN_M1 9  // Base Yaw
  #define PIN_M2 10 // Shoulder
  #define PIN_M3 11 // Elbow
#endif

// Servos
Servo servo1; // Base
Servo servo2; // Shoulder
Servo servo3; // Elbow

// Pulse Limits (Microseconds)
const int MIN_PULSE_US = 1100;
const int MAX_PULSE_US = 1900;
const int SAFE_MIN_US  = 1300; // -45 deg
const int SAFE_MAX_US  = 1700; // +45 deg
const int HOME_US      = 1500; // 1.5ms neutral home

// Current target microsecond values
int currentM1 = HOME_US;
int currentM2 = HOME_US;
int currentM3 = HOME_US;

bool servosAttached = false;
String inputString = "";
bool stringComplete = false;

void attachAllServos() {
  if (!servosAttached) {
    #if defined(ESP32) || defined(ARDUINO_ARCH_ESP32)
      servo1.setPeriodHertz(50);
      servo2.setPeriodHertz(50);
      servo3.setPeriodHertz(50);
    #endif
    servo1.attach(PIN_M1, MIN_PULSE_US, MAX_PULSE_US);
    servo2.attach(PIN_M2, MIN_PULSE_US, MAX_PULSE_US);
    servo3.attach(PIN_M3, MIN_PULSE_US, MAX_PULSE_US);
    servosAttached = true;
  }
}

void detachAllServos() {
  if (servosAttached) {
    servo1.detach();
    servo2.detach();
    servo3.detach();
    servosAttached = false;
    Serial.println("OK: Servos detached (E-STOP)");
  }
}

void applyPulses() {
  attachAllServos();
  servo1.writeMicroseconds(currentM1);
  servo2.writeMicroseconds(currentM2);
  servo3.writeMicroseconds(currentM3);
}

void setHome() {
  currentM1 = HOME_US;
  currentM2 = HOME_US;
  currentM3 = HOME_US;
  applyPulses();
  Serial.println("OK: Homed all motors to 1.5ms (1500us)");
}

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 2000) {} // Brief settle

  inputString.reserve(64);

  // Initialize and go to home position (1.5ms for all motors)
  attachAllServos();
  setHome();

  Serial.println("=================================================");
  Serial.println("RASTICrane ME416 Robot Arm Controller Ready");
  Serial.println("Baud: 115200 | Home: 1500us (1.5ms) all motors");
  Serial.println("Commands: M1 <us>, M2 <us>, M3 <us>, POS <m1> <m2> <m3>, HOME, STOP");
  Serial.println("=================================================");
}

void parseAndExecuteCommand(String cmd) {
  cmd.trim();
  if (cmd.length() == 0) return;

  cmd.toUpperCase();

  if (cmd == "HOME") {
    setHome();
    return;
  }

  if (cmd == "STOP" || cmd == "ESTOP") {
    detachAllServos();
    return;
  }

  if (cmd == "PING") {
    Serial.print("PONG M1:");
    Serial.print(currentM1);
    Serial.print(" M2:");
    Serial.print(currentM2);
    Serial.print(" M3:");
    Serial.println(currentM3);
    return;
  }

  // Multi-motor command: "POS 1500 1480 1520"
  if (cmd.startsWith("POS")) {
    int p1 = cmd.indexOf(' ');
    int p2 = cmd.indexOf(' ', p1 + 1);
    int p3 = cmd.indexOf(' ', p2 + 1);
    if (p1 > 0 && p2 > 0 && p3 > 0) {
      int m1 = cmd.substring(p1 + 1, p2).toInt();
      int m2 = cmd.substring(p2 + 1, p3).toInt();
      int m3 = cmd.substring(p3 + 1).toInt();

      currentM1 = constrain(m1, MIN_PULSE_US, MAX_PULSE_US);
      currentM2 = constrain(m2, MIN_PULSE_US, MAX_PULSE_US);
      currentM3 = constrain(m3, MIN_PULSE_US, MAX_PULSE_US);
      applyPulses();

      Serial.print("OK: POS ");
      Serial.print(currentM1);
      Serial.print(" ");
      Serial.print(currentM2);
      Serial.print(" ");
      Serial.println(currentM3);
      return;
    }
  }

  // Single motor commands: "M1 1500", "M2 1480", "M3 1520"
  if (cmd.startsWith("M1") || cmd.startsWith("M2") || cmd.startsWith("M3")) {
    int motorIdx = cmd.charAt(1) - '0';
    int spaceIdx = cmd.indexOf(' ');
    if (spaceIdx > 0) {
      int us = cmd.substring(spaceIdx + 1).toInt();
      us = constrain(us, MIN_PULSE_US, MAX_PULSE_US);

      if (motorIdx == 1) currentM1 = us;
      else if (motorIdx == 2) currentM2 = us;
      else if (motorIdx == 3) currentM3 = us;

      applyPulses();

      Serial.print("OK: M");
      Serial.print(motorIdx);
      Serial.print(" = ");
      Serial.print(us);
      Serial.println("us");
      return;
    }
  }

  Serial.print("ERROR: Unknown command '");
  Serial.print(cmd);
  Serial.println("'. Try HOME, POS <m1> <m2> <m3>, or M1 1500");
}

void loop() {
  while (Serial.available()) {
    char inChar = (char)Serial.read();
    if (inChar == '\n' || inChar == '\r') {
      if (inputString.length() > 0) {
        parseAndExecuteCommand(inputString);
        inputString = "";
      }
    } else {
      inputString += inChar;
    }
  }
}
