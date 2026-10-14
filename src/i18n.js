// -----------------------------------------------------------------------------
// Runtime texts shown in Gladys (connection status, action results, widget).
// -----------------------------------------------------------------------------

const host = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return String(url);
  }
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export const T = {
  ok: (server, houses) => ({
    en: `Receiving the Blitzortung feed from ${host(server)}: watching ${plural(houses, 'house', 'houses')}.`,
    fr: `Flux Blitzortung reçu de ${host(server)} : ${plural(houses, 'maison surveillée', 'maisons surveillées')}.`,
  }),
  connecting: {
    en: 'Connecting to the Blitzortung feed…',
    fr: 'Connexion au flux Blitzortung…',
  },
  lost: (seconds) => ({
    en: `The Blitzortung feed is unreachable: next attempt in ${seconds} s, on the next server.`,
    fr: `Le flux Blitzortung est injoignable : nouvel essai dans ${seconds} s, sur le serveur suivant.`,
  }),
  noHouse: {
    en: 'No located house: set the location of your house in Gladys (Settings → Houses), then open Discovery.',
    fr: "Aucune maison localisée : renseignez l'emplacement de votre maison dans Gladys (Paramètres → Maisons), puis ouvrez Découverte.",
  },
  housesUnavailable: (message) => ({
    en: `The location of the houses is not available (${message}): reinstall the integration and accept the location access.`,
    fr: `L'emplacement des maisons n'est pas disponible (${message}) : réinstallez l'intégration et acceptez l'accès à la localisation.`,
  }),
  noDevice: {
    en: 'Open Discovery and add the lightning device of your house: the feed opens once a device exists.',
    fr: "Ouvrez Découverte et ajoutez l'appareil foudre de votre maison : le flux s'ouvre dès qu'un appareil existe.",
  },
  invalidServers: (list) => ({
    en: `Ignored servers (neither "ws1" nor a wss:// address): ${list.join(', ')}.`,
    fr: `Serveurs ignorés (ni « ws1 » ni une adresse wss://) : ${list.join(', ')}.`,
  }),
  widget: {
    title: { en: 'Lightning', fr: 'Foudre' },
    pickHouse: {
      en: 'Pick the lightning device of a house in the widget settings',
      fr: "Choisissez l'appareil foudre d'une maison dans les réglages du widget",
    },
    notLoaded: { en: 'Waiting for the Blitzortung feed…', fr: 'En attente du flux Blitzortung…' },
    status: { en: 'Lightning', fr: 'Foudre' },
    calm: { en: 'Calm', fr: 'Calme' },
    stormAt: (km, direction) => ({
      en: `Storm at ${km} km${direction ? ` ${direction}` : ''}`,
      fr: `Orage à ${km} km${direction ? ` ${direction}` : ''}`,
    }),
    approaching: { en: 'Approaching', fr: 'Se rapproche' },
    strikes: (minutes) => ({ en: `Strikes ${minutes} min`, fr: `Impacts ${minutes} min` }),
    nearest: { en: 'Nearest', fr: 'Le plus proche' },
    last: { en: 'Last strike', fr: 'Dernier impact' },
    ago: (minutes) => ({
      en: minutes === 0 ? 'now' : `${minutes} min ago`,
      fr: minutes === 0 ? 'maintenant' : `il y a ${minutes} min`,
    }),
    never: { en: 'none yet', fr: 'aucun' },
    credit: (radiusKm) => ({
      en: `Within ${radiusKm} km · data Blitzortung.org · unofficial, not a safety system`,
      fr: `Rayon ${radiusKm} km · Blitzortung.org · non officiel, pas un système de sécurité`,
    }),
  },
};
