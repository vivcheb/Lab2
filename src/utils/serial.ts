/**
 * Web Serial API utility for direct hardware communication with ESP32 / Arduino / RASTICrane
 * Compatible with Chrome, Edge, and Chromium-based browsers running on localhost.
 */

export interface SerialState {
  isConnected: boolean;
  portName?: string;
  baudRate: number;
  lastSent?: string;
  lastReceived?: string;
  error?: string;
}

export type SerialDataListener = (data: string) => void;
export type SerialStatusListener = (connected: boolean, message?: string) => void;

class WebSerialManager {
  private port: any = null;
  private writer: any = null;
  private reader: any = null;
  private isReading = false;
  private dataListeners: Set<SerialDataListener> = new Set();
  private statusListeners: Set<SerialStatusListener> = new Set();
  private baudRate: number = 115200;

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  public onData(callback: SerialDataListener) {
    this.dataListeners.add(callback);
    return () => {
      this.dataListeners.delete(callback);
    };
  }

  public onStatus(callback: SerialStatusListener) {
    this.statusListeners.add(callback);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  public getIsConnected(): boolean {
    return this.port !== null && this.writer !== null;
  }

  public async connect(baud: number = 115200): Promise<boolean> {
    if (!this.isSupported()) {
      throw new Error(
        'Web Serial API is not supported in this browser. Please use Google Chrome or Microsoft Edge.'
      );
    }

    try {
      this.baudRate = baud;
      // Prompt user to select COM / USB port in browser dialog
      this.port = await (navigator as any).serial.requestPort();
      await this.port.open({ baudRate: this.baudRate });

      try {
        await this.port.setSignals({ dataTerminalReady: true, requestToSend: true });
      } catch (e) {
        // Some virtual ports don't support setSignals; safe to continue
      }

      const textEncoder = new TextEncoderStream();
      textEncoder.readable.pipeTo(this.port.writable);
      this.writer = textEncoder.writable.getWriter();

      this.startReading();
      this.notifyStatus(true, `Connected to USB Serial @ ${this.baudRate} baud`);
      return true;
    } catch (err: any) {
      this.port = null;
      this.writer = null;
      this.notifyStatus(false, err?.message || 'Connection failed');
      throw err;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.writer) {
        await this.writer.close();
        this.writer = null;
      }
      if (this.reader) {
        await this.reader.cancel();
        this.reader = null;
      }
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
    } catch (err) {
      console.warn('Error during serial disconnect:', err);
    } finally {
      this.isReading = false;
      this.port = null;
      this.writer = null;
      this.reader = null;
      this.notifyStatus(false, 'Disconnected');
    }
  }

  public async sendCommand(cmd: string): Promise<boolean> {
    if (!this.writer) return false;
    try {
      const clean = cmd.trim();
      if (!clean) return true;
      const line = `${clean}\r\n`;
      await this.writer.write(line);
      return true;
    } catch (err) {
      console.error('Failed to send serial command:', err);
      return false;
    }
  }

  public async sendMotors(m1_us: number, m2_us: number, m3_us: number): Promise<boolean> {
    const s1 = Math.round(m1_us);
    const s2 = Math.round(m2_us);
    const s3 = Math.round(m3_us);
    // Send individual M1, M2, M3 and combined POS so any Arduino/ESP32 parser catches it
    await this.sendCommand(`M1 ${s1}`);
    await this.sendCommand(`M2 ${s2}`);
    await this.sendCommand(`M3 ${s3}`);
    await this.sendCommand(`POS ${s1} ${s2} ${s3}`);
    return true;
  }

  public async homeArm(homeUs: number = 2500): Promise<boolean> {
    const s = Math.round(homeUs);
    // Send individual M1, M2, M3, POS, and HOME to guarantee execution
    await this.sendCommand(`M1 ${s}`);
    await this.sendCommand(`M2 ${s}`);
    await this.sendCommand(`M3 ${s}`);
    await this.sendCommand(`POS ${s} ${s} ${s}`);
    await this.sendCommand(`HOME`);
    return true;
  }

  public async zeroArm(zeroUs: number = 1500): Promise<boolean> {
    const s = Math.round(zeroUs);
    // Send individual M1, M2, M3, POS, and ZERO to set 1500us (1.5ms) for all motors
    await this.sendCommand(`M1 ${s}`);
    await this.sendCommand(`M2 ${s}`);
    await this.sendCommand(`M3 ${s}`);
    await this.sendCommand(`POS ${s} ${s} ${s}`);
    await this.sendCommand(`ZERO`);
    return true;
  }

  public async stopArm(): Promise<boolean> {
    await this.sendCommand('STOP');
    await this.sendCommand('ESTOP');
    return true;
  }

  private async startReading() {
    if (!this.port || !this.port.readable || this.isReading) return;
    this.isReading = true;

    try {
      while (this.port && this.port.readable && this.isReading) {
        const textDecoder = new TextDecoderStream();
        this.port.readable.pipeTo(textDecoder.writable);
        const reader = textDecoder.readable.getReader();
        this.reader = reader;

        try {
          let buffer = '';
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
              buffer += value;
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';
              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed) {
                  this.notifyData(trimmed);
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      }
    } catch (err) {
      console.warn('Serial read loop ended or aborted:', err);
    } finally {
      this.isReading = false;
    }
  }

  private notifyData(data: string) {
    this.dataListeners.forEach((listener) => {
      try {
        listener(data);
      } catch (e) {
        console.error(e);
      }
    });
  }

  private notifyStatus(connected: boolean, message?: string) {
    this.statusListeners.forEach((listener) => {
      try {
        listener(connected, message);
      } catch (e) {
        console.error(e);
      }
    });
  }
}

export const serialManager = new WebSerialManager();
