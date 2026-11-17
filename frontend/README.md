# Frontend

React/Vite: email/password через Firebase і особистий профіль через API. Запуск: [кореневий README](../README.md).

## Google sign-in

Enable the Google provider in Firebase Authentication and add the deployed site to Authorized domains. Build the frontend with the Firebase web app settings from that same project. The login and registration screens both show **Продовжити через Google**. On the deployed HTTPS site, verify first sign-in, subsequent sign-in, logout, page reload, and access to a private profile. For local development, the Firebase Auth Emulator can exercise the popup without a production Google account. [Firebase documentation](https://firebase.google.com/docs/auth/web/google-signin)


## Chat presentation

New replies in the funding and project chats reveal progressively after the JSON response arrives. This is a local presentation animation, not backend streaming. History opens in full; reduced-motion and hidden pages skip the animation, and users can choose to show the whole response. Text entry keeps Enter-to-send, Shift+Enter for a new line, and IME composition handling. Recommendation and proposal actions appear after reveal completion.
