# Messages programmés / رسائل مجدولة

Rédige un message aujourd'hui, il part à l'heure choisie (ex. demain 09:00).

## Lancer
1. Installer Node.js 20.6+ : https://nodejs.org
2. `npm install`
3. `cp .env.example .env` puis remplir `.env` (au minimum APP_USER / APP_PASS + un canal)
4. `npm start` → ouvrir http://localhost:3000

## Important
L'envoi se fait par le **serveur** : il doit être allumé à l'heure prévue.
Pour que ça marche téléphone éteint / PC éteint, héberge-le sur un serveur
(Render, Railway, Fly.io, VPS...) — ajoute un volume persistant pour `data/`.

## Canaux
- Email : SMTP (Gmail : activer la validation en 2 étapes + "mot de passe d'application")
- Telegram : créer un bot via @BotFather, le destinataire doit d'abord écrire /start au bot; destinataire = son Chat ID
- SMS / WhatsApp : compte Twilio (payant)

Les messages sont stockés dans `data/messages.json`. L'heure est convertie en UTC côté navigateur, donc le fuseau horaire est respecté.

## Dépannage
- `node: .env: not found` : `Copy-Item .env.example .env` puis remplir APP_USER / APP_PASS.
- Gmail « Username and Password not accepted » : utiliser un mot de passe d'application (validation en 2 étapes requise).
- Un message reste `failed` : le texte rouge sur la carte donne la raison exacte.
- Une heure déjà passée est refusée (vérifie AM/PM et la date).
