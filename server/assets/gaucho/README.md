Fotos de Gaucho (`*.jpg`) para el few-shot del `GeminiReader`. Van **todas en cada request**, así que el peso importa más que la cantidad: mantenerlas en ≤ 384 px de lado mayor (~30–40 KB c/u). Medido: 9 fotos @384px suman ~300 KB y +1 s de latencia; @640px (~830 KB) rozan el timeout de 6 s.

Para achicar una foto nueva del celu (macOS): `sips -Z 384 -s format jpeg -s formatOptions 70 Foto.jpeg --out GauchoN.jpg`
