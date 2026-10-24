# VPS-Betrieb und Updates

Diese Anleitung gilt für die Debian-VPS-Installation. Die Skripte enthalten **keine Geheimnisse**; produktive Konten, Datenbanken, Tokens und Backups dürfen niemals ins Repository.

## Installation

Voraussetzungen: Node.js, Git, systemd, Nginx, Benutzer `tobias`; Checkout in `/opt/games`, Dienst `games.service`. Die Befehle als `root` ausführen.

```bash
cd /opt/games
install -m 700 -o root -g root scripts/games-update /usr/local/bin/games-update
install -m 755 -o root -g root scripts/games-status /usr/local/bin/games-status
```

Die Installationskopien unter `/usr/local/bin` sind absichtlich unabhängig vom Git-Checkout. Bei einer Änderung an den Skripten muss man sie erneut installieren (z. B. nach einem `git pull`). **Nicht** mit `curl | bash` installieren.

## Benutzung

```bash
games-status
games-update
games-status
```

`games-update` ist für Ausführung als `root` vorgesehen, nutzt für Git und npm jedoch den Benutzer `tobias`. Es lädt `origin/main`, verlangt einen sauberen Git-Arbeitsbaum und einen Fast-Forward, erstellt ein lokal geschütztes vollständiges Backup unter `/root/backups`, aktualisiert Code und Abhängigkeiten, startet `games.service` neu und prüft `http://127.0.0.1:3000/api/auth/me`. Bei Fehlern nach dem Backup wird ein Best-Effort-Rollback des Codes und der Abhängigkeiten versucht.

**Grenzen:** Ein erfolgreicher HTTP-Check ersetzt keinen Funktionstest. Der automatische Rollback stellt keine geänderte Datenbank wieder her. Schemaänderungen oder Migrationen erfordern einen gesonderten Plan. Ein Update kann laufende Spiele unterbrechen. Die vollständigen Backups enthalten private Daten und gehören **nicht** nach GitHub. Backups regelmäßig extern verschlüsselt sichern und Aufbewahrungsregeln festlegen.

## Wichtige Pfade

- Anwendung: `/opt/games`
- Dienst: `games.service`
- Nginx-Konfiguration: `/etc/nginx/sites-available/games`
- Backups: `/root/backups`
- Verwaltung: `cd /opt/games && runuser -u tobias -- node manage-users.js list`

## Fehleranalyse

```bash
systemctl status games --no-pager
journalctl -u games -n 80 --no-pager
nginx -t
```

Passwörter, Cookies, Tokens oder Datenbankinhalte nicht in öffentliche Issues oder Logs kopieren.
