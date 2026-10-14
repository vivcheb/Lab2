# ME416 Stamp Machine Workspace Visualizer

CAD-accurate 2-DOF robotic arm pick-and-place visualizer for the ME416 stamp machine assembly, AprilTag vision calibration, and kinematic trajectory simulation.

---

## 🚀 How to Run Locally on Your Laptop

Follow these simple steps to get the app running on your local machine (macOS, Windows, or Linux):

### 1. Prerequisites

Make sure you have **Node.js** (version 18, 20, or 22+) installed on your laptop:
- Check if Node.js is installed by opening your terminal / command prompt and running:
  ```bash
  node -v
  npm -v
  ```
- If not installed, download the **LTS** version from [nodejs.org](https://nodejs.org/).

---

### 2. Clone the Repository

Open your terminal (Terminal on macOS/Linux, or PowerShell / Command Prompt / Git Bash on Windows):

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd <REPOSITORY_FOLDER_NAME>
```

*(Replace `<YOUR_GITHUB_REPOSITORY_URL>` with your repository's URL from GitHub, e.g. `https://github.com/your-username/me416-stamp-visualizer.git`)*

---

### 3. Install Dependencies

Install the project packages using `npm`:

```bash
npm install
```

*(You can also use `pnpm install`, `yarn install`, or `bun install` if preferred).*

---

### 4. Start the Local Development Server

Run:

```bash
npm run dev
```

You will see output similar to:
```text
  VITE v8.x.x  ready in 250 ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: http://0.0.0.0:3000/
```

---

### 5. Open in Your Web Browser

Open your browser (Chrome, Edge, Firefox, Safari, etc.) and navigate to:

👉 **[http://localhost:3000](http://localhost:3000)**

The visualizer with the 2-DOF robotic arm, AprilTag tracking, word sequencer, and telemetry will load immediately. Hot module reloading (HMR) and live updates are enabled.

---

## 🛠️ Available Scripts

- **`npm run dev`**: Starts the local Vite dev server on `http://localhost:3000` with hot-reloading.
- **`npm run build`**: Compiles TypeScript and creates an optimized static production bundle in the `dist/` directory.
- **`npm run preview`**: Previews the built production build locally.
- **`npm run lint`**: Runs TypeScript checks (`tsc --noEmit`).

---

## 💡 Troubleshooting & Tips

- **Port 3000 already in use**: If another process is using port 3000, Vite will either use the next available port (e.g. `3001`) or you can run `npx vite --port 5173`.
- **Node version error**: If you encounter dependency issues, verify that you are running Node.js 18 or newer (`node -v`).
- **Windows PowerShell script restriction**: If PowerShell gives an execution policy error when running `npm`, run PowerShell as Administrator and execute `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` or use Git Bash / Command Prompt.

---

## 🤖 Controlling the Real-Life Robotic Arm

You have **3 ways** to control the physical RASTICrane 3-DOF robot arm:

### 1. Wiring & Microcontroller Hardware Setup
Connect your 3 PWM servos to your microcontroller (ESP32-S3 or Arduino Uno/Mega):

| Servo | Function | ESP32 Pin | Arduino Pin | Home Position | Working Range |
|---|---|---|---|---|---|
| **Motor 1 (M1)** | Shoulder Elevation ($\theta_1$) | **GPIO 18** | **Pin 9** | 2500 µs (+90° Home) | 1500 µs (0°) to 2500 µs (+90°) |
| **Motor 2 (M2)** | Base Yaw ($\theta_0$) | **GPIO 19** | **Pin 10** | 2500 µs (+90° Home) | 1500 µs (0°) to 2500 µs (+90°) |
| **Motor 3 (M3)** | Elbow Elevation ($\theta_2$) | **GPIO 20** | **Pin 11** | 2500 µs (+90° Home) | 1500 µs (0°) to 2500 µs (+90°) |

> ⚠️ **Power Caution**: Do NOT power servos directly from the microcontroller 5V pin! Use an external 5V/6V 2A–3A DC power supply for servo power ($+$ and $-$). **Always connect the external power supply GND to the microcontroller GND** (common ground).

---

### 2. Flash the Firmware
The firmware is located in `firmware/rasticrane_controller.ino`.
1. Open `firmware/rasticrane_controller.ino` in the **Arduino IDE**.
2. If using ESP32: install the `ESP32Servo` library via **Tools &rarr; Manage Libraries**.
3. Select your board and COM port.
4. Click **Upload**. On boot, all 3 motors will automatically center at neutral home (1.5 ms / 1500 µs).

---

### 3. Control Option A: Directly from this Web App (Web Serial)
*(Recommended — No extra code needed!)*

1. Open this web app in **Google Chrome** or **Microsoft Edge** at `http://localhost:3000`.
2. Connect your ESP32 / Arduino to your laptop via USB.
3. Click the **"Connect Arm (USB)"** button in the header or the **"Real Arm Control"** tab.
4. Select your USB Serial Port (e.g., `COM3` on Windows, `/dev/ttyUSB0` on Linux, `/dev/tty.usbmodem*` on Mac) and baud rate (`115200`).
5. **Done!**
   - Click **"Home Arm"** to center all motors to 1.5ms.
   - Run any word sequence in the Word Sequencer: the physical arm will mirror the digital twin in real time.
   - Jog manually or use the pulse sliders to calibrate individual servos.
   - Monitor live bidirectional TX/RX traffic in the built-in Serial Monitor.

---

### 4. Control Option B: Standalone Python Script
A lightweight Python CLI controller is included in `scripts/arm_controller.py`:
```bash
pip install pyserial
python scripts/arm_controller.py
```
Follow the interactive prompt to send `home`, `pos 1500 1480 1520`, or individual `m1 1450` commands.

---

### 5. Control Option C: MATLAB Script (ME416 Lab 2 Handout)
To run via MATLAB:
1. Open MATLAB and open the controller script in the **"Controller Script & Serial"** tab in the app.
2. Set `portName = "COM3";` (or your OS port).
3. Run the script: it connects to the serial port, starts the webcam AprilTag detector, and writes pulse width commands (`writeline(s, "M1 1500")`).
