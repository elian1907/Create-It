#!/bin/zsh
set -e
cd -- "$(dirname "$0")"
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  print 'Installez Node.js 24 ou plus depuis https://nodejs.org puis relancez ce fichier.'
  read '?Appuyez sur Entrée pour fermer.'
  exit 1
fi
if [[ ! -d node_modules ]]; then npm ci; fi
npm run build
print 'Ouvrez http://127.0.0.1:4310 dans votre navigateur. Ctrl+C arrête le service.'
npm start
