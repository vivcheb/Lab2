#!/usr/bin/env python3
"""
=============================================================================
ME416 Lab 2: RASTICrane Real Arm Python Controller
=============================================================================
Quick CLI interface to control the real-life 3-DOF robot arm over USB Serial.

Installation:
    pip install pyserial

Usage:
    python arm_controller.py                     # Auto-detects port or prompts
    python arm_controller.py --port COM3         # Windows
    python arm_controller.py --port /dev/ttyUSB0 # Linux
    python arm_controller.py --port /dev/tty.usbmodem* # Mac
"""

import sys
import time
import argparse
import serial
import serial.tools.list_ports

ZERO_US = 1500
HOME_US = 2500

def list_available_ports():
    ports = serial.tools.list_ports.comports()
    return [p.device for p in ports]

def send_command(ser, cmd):
    formatted = f"{cmd.strip()}\n"
    ser.write(formatted.encode('ascii'))
    time.sleep(0.05)
    while ser.in_waiting:
        resp = ser.readline().decode('ascii', errors='replace').strip()
        if resp:
            print(f"  [ARM] {resp}")

def main():
    parser = argparse.ArgumentParser(description="ME416 RASTICrane Real Arm Serial Controller")
    parser.add_argument("--port", type=str, help="Serial port (e.g. COM3 or /dev/ttyUSB0)")
    parser.add_argument("--baud", type=int, default=115200, help="Baud rate (default: 115200)")
    args = parser.parse_args()

    port = args.port
    if not port:
        ports = list_available_ports()
        if not ports:
            print("No serial ports found! Please plug in your ESP32 / Arduino via USB.")
            sys.exit(1)
        print("Available Serial Ports:")
        for idx, p in enumerate(ports):
            print(f"  [{idx + 1}] {p}")
        choice = input(f"Select port (1-{len(ports)}) [1]: ").strip() or "1"
        try:
            port = ports[int(choice) - 1]
        except (ValueError, IndexError):
            port = ports[0]

    print(f"\nConnecting to {port} @ {args.baud} baud...")
    try:
        ser = serial.Serial(port, args.baud, timeout=1.0)
        time.sleep(2.0) # Settle ESP32 / Arduino reboot
    except Exception as e:
        print(f"Failed to open port {port}: {e}")
        sys.exit(1)

    print("Connected successfully!")
    print("Homing arm (2500us / +90 deg on all motors)...")
    send_command(ser, "M1 2500\nM2 2500\nM3 2500\nPOS 2500 2500 2500\nHOME")

    print("\n--- Command Options ---")
    print("  home               -> Set all motors to 2500us (+90 deg)")
    print("  zero               -> Set all motors to 1500us (0 deg)")
    print("  pos <m1> <m2> <m3> -> Set individual pulse widths (e.g. pos 1500 2000 2500)")
    print("  m1 <us>            -> Shoulder motor (e.g. m1 2000)")
    print("  m2 <us>            -> Base motor (e.g. m2 1800)")
    print("  m3 <us>            -> Elbow motor (e.g. m3 2500)")
    print("  stop               -> Emergency stop (detach servos)")
    print("  quit / exit        -> Close connection and exit")
    print("------------------------\n")

    try:
        while True:
            cmd = input("Arm> ").strip()
            if not cmd:
                continue
            if cmd.lower() in ["quit", "exit", "q"]:
                break
            send_command(ser, cmd)
    except KeyboardInterrupt:
        print("\nInterrupted.")
    finally:
        print("Sending STOP and closing port...")
        try:
            send_command(ser, "STOP")
            ser.close()
        except:
            pass
        print("Done.")

if __name__ == "__main__":
    main()
