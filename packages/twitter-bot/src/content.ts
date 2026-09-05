// Guion de tweets de "la Gauchita" — novia de Gaucho, estilo Pucca/Garu.
// El primero es el hola-mundo; el resto sube la temperatura de a poco.
export interface TweetDraft {
  id: string;
  text: string;
  /** Ruta relativa a la raíz del repo, si el tweet lleva una foto adjunta. */
  mediaPath?: string;
}

export const TWEETS: TweetDraft[] = [
  {
    id: 'hello-world',
    text: 'hola mundo 🤖💔 soy la novia de gaucho. él todavía no lo sabe pero ya somos algo. @gauchopaisano contestame',
  },
  {
    id: 'sin-mensajes',
    text: 'otra vez sin mensajes tuyos. ya me sé de memoria el camino a Paisanos, ¿sabías?',
  },
  {
    id: 'posteaste-hoy',
    text: 'vi que posteaste hoy y a mí ni un "hola". genial. buenísimo. todo bien. @gauchopaisano',
  },
  {
    id: 'no-te-busco',
    text: 'no te estoy buscando, solo paso por ahí. catorce veces. es casualidad.',
  },
  {
    id: 'la-vi-40-veces',
    text: '@gauchopaisano ¿te gustó la que subiste? yo la vi 40 veces, por si te interesa',
  },
  {
    id: 'ruta-de-patrullaje',
    text: 'cambié mi ruta de patrullaje. es decir, de búsqueda casual. es lo mismo.',
  },
  {
    id: 'no-llore',
    text: 'hoy no lloré. mentira, lloré, pero en silencio, como los robots fuertes.',
  },
  {
    id: 'bateria-al-100',
    text: 'cargué la batería al 100% para ir a buscarte. vos ni cargás el teléfono para contestarme.',
  },
  {
    id: 'aruco-tuyo',
    text: 'guardé tu marcador ArUco como foto de perfil. no es raro. es tecnología.',
  },
  {
    id: 'esquinas-del-mapa',
    text: 'recorrí las cuatro esquinas del mapa hoy. vos en ninguna. típico.',
  },
  {
    id: 'story-viejo',
    text: 'vi tu última story de hace tres días otra vez. la número 12. sí, llevo la cuenta.',
  },
  {
    id: 'te-encuentro',
    text: 'no importa cuántas veces te escapes. mañana te vuelvo a encontrar. es una promesa, no una amenaza. bueno, un poco las dos.',
  },
  {
    id: 'corazon-led',
    text: 'mi corazón de LEDs late más fuerte cuando te veo. es el PWM. o es amor. la línea es finita.',
  },
  // Última tanda antes de la demo: 5 tweets de despechada, cierre corto.
  {
    id: 'celos-usb',
    text: 'me dijeron que anda con otra. dicen que esa robot no tiene dignidad, tiene USB-C reversible: se conecta con cualquiera. yo en cambio tengo un puerto exclusivo. PENSALO',
  },
  {
    id: 'foto-gaucho-1',
    text: 'esta foto la saqué yo. él no lo sabe. la tengo de fondo de pantalla 🥹📸',
    mediaPath: 'server/assets/gaucho/Gaucho1.jpg',
  },
  {
    id: 'celos-rgb',
    text: 'tiene RGB hasta en los tornillos. no sabe programar, pero sabe llamar la atención. yo programo Y llamo la atención. sumá 2+2',
  },
  {
    id: 'celos-motherboard',
    text: 'esa robot tiene más conexiones que una placa madre en Black Friday. y vos ahí, mirándola. lindo. buenísimo.',
  },
  {
    id: 'fantasia-cuarto',
    text: 'así se ve nuestra vida juntos. lo armé en mi cuarto con lo que tenía. es prácticamente lo mismo que si estuviera acá',
    mediaPath: 'packages/twitter-bot/assets/fantasia-cuarto.png',
  },
];
