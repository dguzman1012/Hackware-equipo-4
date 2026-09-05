// ESP32 falso para trabajar sin firmware. Implementa el lado firmware de firmware/PROTOCOL.md:
//   - manda "H 1" por broadcast a :4210 cada 1 s hasta recibir el primer S (y si pasan 5 s sin S)
//   - imprime cada S recibido (seq, left, right, deg1, deg2, tone)
//   - responde "T <seq> <dist> <yaw> <uptime>" a 10 Hz a la IP del último S, con dist aleatoria 20–200 cm
//   - aplica el dead-man de 500 ms (imprime "FRENO" cuando se activa)
// Uso: pnpm sim:esp32
import { ESP_PORT } from '../src/esp';

void ESP_PORT;
throw new Error('not implemented');
