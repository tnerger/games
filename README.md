# Games 🎲

Multiplayer-Spieleplattform mit UNO, Skyjo, Wizard und Elfer Raus. Private Benutzerkonten werden durch Administratoren erstellt; es gibt keine öffentliche Registrierung.

## VPS (Produktion)

Die Anwendung läuft unter Node.js mit systemd und einem Nginx-HTTPS-Reverse-Proxy. Anleitung, Update- und Status-Skripte: [VPS-Betrieb und Updates](docs/vps-deployment.md).

Nach der Installation der Skripte auf dem Server:

```bash
games-status
games-update
```

## Entwicklung

```bash
git clone https://github.com/tnerger/games.git
cd games
npm install
node server.js
```

Für lokale Tests getrennte Datenverzeichnisse und Konten verwenden. Nicht dieselbe Datenbank wie auf dem Produktivserver nutzen.

## Sicherheit

`data/`, `.env`, Tokens, Datenbanken, SSH-Schlüssel und Backups niemals committen. Benutzerkonten sind privat; keine Selbstregistrierung. Der Node.js-Port sollte im Produktivbetrieb nur auf `127.0.0.1` lauschen.
