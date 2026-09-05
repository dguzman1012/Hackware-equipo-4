# firmware/

El código del ESP32 vive acá (lo sube quien hace el firmware). Lo único que define este repo es el contrato con el server: [`PROTOCOL.md`](PROTOCOL.md).

Para probar sin el server: ver la sección "Probarlo sin el server" del contrato. Para probar el server sin ESP32: `pnpm sim:esp32` desde la raíz.
