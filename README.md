# Games 🎲

Lokale, barrierearme Multiplayer-Spieleplattform. Version 0.1.0: gemeinsame Lobby mit Räumen für bis zu 6 Personen. Kartenspiele folgen.

## Pixel 7 / Termux

```bash
pkg install nodejs-lts git
git clone https://github.com/tnerger/games.git ~/games
cd ~/games
npm install
bash start.sh
```

Pixel: http://127.0.0.1:3000 — andere Geräte: http://PIXEL-WLAN-IP:3000

Beenden: Strg+C. Kein Autostart.

## Update

Server beenden, dann:

```bash
cd ~/games
bash update.sh
bash start.sh
```

Daten liegen unter `data/` und werden nicht eingecheckt. Der Updater bricht bei lokalen Git-Änderungen ab.

## Hinweise

Nur in einem vertrauenswürdigen WLAN verwenden. Es gibt noch keine Anmeldung oder Admin-Rechte. Raumcodes sind keine Sicherheitsgrenze. Beim Browser-Neustart muss der Raumcode eventuell erneut eingegeben werden. Die Lobby speichert Räume, noch keine Kartenspiele.
